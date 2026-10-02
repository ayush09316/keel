# Keel

A durable workflow engine built on Postgres. Multi-step business processes that
survive worker crashes, third-party flakiness and duplicate delivery — without
charging the customer twice.

```
60 runs · 4 workers · 9 SIGKILL · 7 SIGSTOP

delivery (at least once, by design)
  steps                                240
  step attempts                        300
  steps that ran more than once         52
  steps reclaimed from a dead worker    14

effects (exactly once, by construction)
  external effects performed           237
  external effects served from cache     3
  physical gateway calls                68
  charges created                       60
  orders charged twice                   0   ← the invariant
```

That block is produced by `manage.py chaos`, not by hand. It is the point of
the project: **delivery is at least once, effects are exactly once**, and the
difference between those two sentences is where all the engineering is.

---

## Why this exists

Every queue you will actually use in production — Celery, SQS, Sidekiq — gives
you *at-least-once* delivery. That is not a limitation to be engineered away;
it is the only thing a distributed system can honestly promise. A worker that
dies after calling Stripe but before writing `charged = True` has to be retried,
and the retry has to not charge the card again.

Most application code answers this with a `try/except` and hope. Keel answers
it with four mechanisms that compose:

| Failure | Mechanism |
|---|---|
| Worker dies mid-step | **Leases** — the step's lock expires and a reaper requeues it |
| Worker stalls (GC pause, network partition) | **Fencing** — its stale commit is rejected on the way in |
| Upstream is flaky | **Retries** with exponential backoff and jitter |
| Retry would repeat a side effect | **Idempotency keys** derived from `(run, step)` |
| Step commits but the event never publishes | **Transactional outbox** — event and state in one transaction |
| Failure is permanent | **Dead-letter queue** with replay from exactly that step |

No Redis, no broker, no Kafka. One Postgres database, because the whole design
depends on the state change and the message being in the same transaction — and
that is only free if they are in the same database.

---

## The mechanisms, and why each one is there

### 1. The queue is a table, claimed with `SKIP LOCKED`

```sql
SELECT … FROM keel_step_run
 WHERE state = 'ready' AND run_after <= now()
 ORDER BY run_after, created_at
 LIMIT 1
   FOR UPDATE SKIP LOCKED
```

`FOR UPDATE` alone makes workers queue behind each other: worker B blocks on
worker A's row lock and throughput collapses to one worker. `SKIP LOCKED` makes
B step over the locked row and take the next one, which is what turns a table
into a concurrent queue.

`test_skip_locked_lets_a_second_worker_past_a_locked_row` holds a real row lock
on a second connection and asserts the claim returns a *different* row rather
than blocking.

### 2. Leases, not locks

A claimed step stores `lease_owner` and `lease_expires_at`. The worker renews
it from a **background thread on its own connection** (`engine/worker.py`)
every `lease/3` seconds.

The alternative — a lease longer than the slowest possible step — means a
crashed worker's step is stuck for that long. The alternative to *that* — no
lease at all — means a crashed worker's step is stuck forever.

The reaper (`queue.reclaim_expired`) finds steps in `running` whose lease has
expired and returns them to `ready`. **It does not refund the attempt.** A step
that crashes the process is charged an attempt every time, so a poison pill
reaches the dead-letter queue instead of killing workers forever
(`test_a_step_that_kills_every_worker_eventually_dies`).

### 3. Fencing: the stalled worker problem

Lease expiry creates a window where **two workers believe they own the same
step**. The reaper cannot kill worker A — it has no way to reach into another
process. A stalled A wakes up and tries to commit.

Every commit is therefore guarded:

```python
StepRun.objects.filter(
    pk=step.pk, state="running",
    lease_owner=self.worker_id, attempt=step.attempt,
).update(…)
```

`attempt` is the fencing token. If the reaper requeued the step, the attempt has
moved on and the `UPDATE` matches zero rows; the executor raises `LeaseLostError`
and the whole transaction — step state, run context, **and the outbox events** —
rolls back. The stale worker's result is discarded in full.

This is the case `chaos --freeze-every` exists to produce. `SIGSTOP` for longer
than the lease is a precise simulation of a stop-the-world pause, and it is the
only way I found to exercise this path deterministically.

### 4. Idempotency: the effect survives what the commit does not

Rolling back the *bookkeeping* is easy. The money already moved.

```python
def charge_payment(self, ctx):
    return ctx.once("charge", lambda key: gateway.charge(key, order_id, amount))
```

`ctx.once` derives a key of `{run_id}:{step_name}:{suffix}` — **stable across
every attempt and every worker** — and:

1. returns the stored result if that key has been seen, or
2. runs the effect, then records the key and result in its own transaction.

Crucially the key is *passed to the gateway*, not just used locally. Local
caching alone still has a window: effect committed, process killed before the
record was written. Handing the key to an upstream that dedupes on it closes
that window, which is exactly why Stripe and Razorpay accept one. `once()` is
the fast path; the upstream's dedupe is the correctness guarantee.

The demo gateway logs **every physical call** to `demo_gateway_call`, including
the deduped ones, which is how the summary can report 68 calls against 60
charges and prove the gap was absorbed rather than avoided.

### 5. Transactional outbox: no dual writes

A step that commits `state = succeeded` and then publishes to a broker has two
failure modes: crash between them (event lost), or publish-then-crash (event
sent for work that rolled back). Both are the dual-write problem.

Instead `ctx.emit()` buffers events in memory, and they are `INSERT`ed into
`keel_outbox_event` **inside the same transaction** as the step's state change.
Either both land or neither does. A separate relay process claims unpublished
rows with `SKIP LOCKED`, pushes them to a sink, and marks them published —
at-least-once, with a `dedupe_key` on the envelope so consumers can dedupe.

`test_events_are_written_with_the_step_not_before_it` and
`test_two_relays_do_not_publish_the_same_event_twice` pin both halves.

### 6. Dead letters and replay

Attempts exhausted, or a step raised `NonRetryableError`, and the step is
buried: a `DeadLetter` row, the run marked `failed`, downstream steps
`cancelled`. `NonRetryableError` skips the remaining attempts entirely — there
is no reason to retry a refund larger than the original charge four more times.

Replay re-arms that step with a fresh attempt budget and un-cancels what was
behind it. **Steps that already succeeded keep their output and are not re-run**,
because the run's `context` is durable state in the database, not memory. That
is the same property that makes a `kill -9` survivable: nothing about a run's
progress lives in a process.

---

## What is deliberately not here

- **No distributed transactions.** The effect and its idempotency record commit
  separately. The window is closed by the upstream honouring the key, not by
  two-phase commit.
- **No DAGs.** Steps are a linear sequence. Parallel branches need a join
  protocol and a different `advance()`; it is a real extension, not a small one.
- **No cross-run ordering.** Two runs of the same workflow are independent. If
  you need per-entity ordering you need a partition key and a claim that
  respects it.
- **Poll-based, not notify-based.** A `LISTEN/NOTIFY` wake-up would cut idle
  latency; polling with backoff was enough here and has one fewer moving part.
- **The API is unauthenticated.** It is a local demo surface, not a control
  plane. Putting auth on it would be the first thing to do before it ran
  anywhere real. For a public demo, `KEEL_READONLY=1` makes every mutating
  endpoint return `403` with an explanation; the dashboard shows a "Read-only
  demo" badge and disables start, cancel and replay.

---

## Running it

Requires Postgres and Python 3.11+.

```bash
createdb keel
python3.11 -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/python manage.py migrate
```

Four terminals (`make api`, `make worker`, `make relay`, `make web`), or
`docker compose up`:

```bash
./venv/bin/python manage.py runserver          # API on :8000
./venv/bin/python manage.py runworker          # one worker (run several)
./venv/bin/python manage.py runrelay           # outbox → sink
cd web && npm install && npm run dev           # dashboard on :3000
```

`/` is the landing page; the dashboard lives under `/overview`, `/runs`,
`/chaos`, `/dead-letters`, `/outbox` and `/workers`. `⌘K` opens a palette that
jumps to a page, finds a run by id prefix or order id, or starts a workflow;
`?` lists the keyboard shortcuts. Set `NEXT_PUBLIC_KEEL_API` if the API is not
on `localhost:8000`.

Then queue some work:

```bash
./venv/bin/python manage.py seed_demo --count 20
```

### The chaos run

```bash
./venv/bin/python manage.py chaos \
  --runs 60 --workers 4 --duration 120 \
  --kill-every 4 --freeze-every 5 --lease 6 --latency-ms 250
```

It truncates, seeds, spawns workers and a relay, then `SIGKILL`s and `SIGSTOP`s
them at random while work is in flight. At the end it runs `verify`, which
fails the process if any invariant broke:

- no order charged more than once
- every completed run has a charge
- no `running` step without a lease
- no completed run containing an unsucceeded step
- no two outbox rows sharing a dedupe key
- every outbox event eventually published

`manage.py verify` can be run at any time against whatever is in the database.

### Recording and replaying it

`chaos` also records the run to `var/chaos/latest.json` (`--record PATH` to move
it, `--no-record` to skip): every `SIGKILL`, `SIGSTOP`, `SIGCONT` and respawn
with its pid and the step the victim was holding, a snapshot every half second
of which step each worker holds and how long its lease has left, the step and
run state counts, attempts, reclaims, fenced commits, gateway calls against
charges, the outbox, and finally the `verify` summary.

`GET /api/chaos/latest/` serves it, falling back to the recording committed at
`web/public/chaos/sample.json`, and the dashboard's **Chaos replay** page plays
it back: worker lanes that flash red on a kill, frost over on a freeze, show the
orphaned step counting down its lease and the reaper taking it back, the stale
worker's commit being fenced when it wakes — with a scrubber, speeds from 0.5×
to 8×, an event log, and an `orders charged twice` badge that stays at zero the
whole way. `?t=21&play=0` opens it paused at a moment.

Reclaims and fences come from a per-attempt log, `keel_step_attempt`: claim
opens a row, and the commit, the reaper and the fencing path close it inside the
transactions they already run. It is bookkeeping only — nothing reads it to
decide anything — and it is also what the run page's attempt timeline draws.

### Tests

```bash
./venv/bin/python -m pytest      # 85 tests
```

Two of them (`test_skip_locked_…`, and the lease-loss cases) need real
concurrent connections and run under `transaction=True`.

---

## Layout

```
engine/
  models.py      WorkflowRun, StepRun, OutboxEvent, IdempotencyRecord, DeadLetter, Worker
  queue.py       claim (SKIP LOCKED), heartbeat, reaper, bury
  executor.py    run a step; the two guarded commit paths
  context.py     StepContext — ctx.once(), ctx.emit()
  outbox.py      relay: claim → publish → mark
  worker.py      the loop, the heartbeat thread, graceful shutdown
  registry.py    @workflow / Step declarations
  service.py     start / cancel / replay / stats
  attempts.py    per-attempt log: opened on claim, closed by commit / reaper / fence
  recorder.py    chaos timeline: signals, half-second snapshots, verify summary
  permissions.py KEEL_READONLY guard
  api.py         DRF read models + the three mutations
  management/commands/
    runworker  runrelay  runreaper  seed_demo  chaos  verify
demo/
  workflows.py   order_fulfilment, refund_request
  services.py    deliberately flaky inventory / gateway / billing / notifications
web/             Next.js 15 + TypeScript + Tailwind dashboard
```

The dashboard shows runs with a per-step progress bar, the accumulated context,
the outbox with publish state, the dead-letter queue with bulk replay, and
workers with a live heartbeat age, the lease each one holds and a throughput
sparkline — so a worker you kill in one terminal goes stale on screen while its
steps go back to `ready`.

A run's detail page draws every **attempt** of every step on one clock rather
than another table, because the step list tells you which steps failed but not
that the run spent nine of its twelve seconds in backoff, or that attempt 2 was
a stalled worker whose lease was reclaimed and whose commit was then fenced.
Each attempt names its lease owner, its outcome, and whether its effect was
performed or served from the idempotency cache.

---

## Things I got wrong on the way

- **I built the reaper before the fencing guard.** For an afternoon the engine
  could requeue a step while the original worker was still running it, and both
  would commit. The `verify` invariant caught it, which is the argument for
  writing the invariant checker before the feature.
- **My first chaos run proved nothing.** 40 runs finished in six seconds, so
  every `SIGKILL` landed between steps rather than during one:
  `leases reclaimed 0`. A green run that exercises none of the interesting paths
  is worse than a red one. Adding step latency and `SIGSTOP` is what made the
  test actually test something.
- **`deduped` read zero and I nearly reported it as a bug.** It was correct —
  `once()` short-circuits before the gateway, so the gateway never sees the
  duplicate. The measurement was in the wrong place, not the mechanism. I added
  `effects_replayed` on the step row to count it where it actually happens.
- **One gateway call had no matching charge** after a chaos run. That turned out
  to be a `SIGKILL` landing in the sub-millisecond gap between the call log
  insert and the charge insert — the real window the idempotency key exists to
  cover, caught by accident. It is now the clearest thing in the summary.
