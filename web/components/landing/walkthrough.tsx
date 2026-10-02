"use client";

import { useEffect, useState } from "react";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { useInView } from "./motion";

const STEPS = [
  {
    n: "01",
    title: "Claim with SKIP LOCKED",
    body: "The queue is a table. FOR UPDATE alone makes workers queue behind each other; SKIP LOCKED lets the next worker step over a locked row and take another. Claiming bumps the attempt — that number is the fencing token.",
    file: "engine/queue.py",
    code: `SELECT … FROM keel_step_run
 WHERE state = 'ready' AND run_after <= now()
 ORDER BY run_after, created_at
 LIMIT 1
   FOR UPDATE SKIP LOCKED;

UPDATE keel_step_run
   SET state = 'running', attempt = attempt + 1,
       lease_owner = :worker, lease_expires_at = now() + :lease`,
    hl: [4],
  },
  {
    n: "02",
    title: "Hold the lease with a heartbeat",
    body: "A background thread on its own connection renews the lease every lease/3 seconds. A worker that dies stops renewing, its lease runs out, and the reaper puts the step back — without refunding the attempt.",
    file: "engine/worker.py",
    code: `while not self.stopped.wait(self.interval):
    rows = heartbeat(step_id, worker_id, attempt, lease)
    if rows == 0:
        self.lost.set()
        return

# heartbeat(): UPDATE … SET lease_expires_at = now() + lease
#   WHERE id = :step AND lease_owner = :me AND attempt = :n`,
    hl: [1, 2],
  },
  {
    n: "03",
    title: "Run the effect once, keyed by (run, step)",
    body: "ctx.once derives a key that is stable across every attempt and every worker, and hands it to the gateway. The local record is the fast path; the upstream honouring the key closes the crash-between-call-and-record window.",
    file: "demo/workflows.py",
    code: `def charge_payment(self, ctx):
    result = ctx.once(
        "charge",
        lambda key: gateway.charge(key, order_id, amount),
    )
    ctx.emit("payment.captured", {...},
             dedupe_key=f"payment.captured:{order_id}")
    return result`,
    hl: [1, 3],
  },
  {
    n: "04",
    title: "Fenced commit + outbox, one transaction",
    body: "The commit only matches if this worker still owns this attempt. If the reaper moved on, zero rows match and everything — step state, run context and the outbox rows — rolls back together.",
    file: "engine/executor.py",
    code: `with transaction.atomic():
    updated = StepRun.objects.filter(
        pk=step.pk, state="running",
        lease_owner=self.worker_id, attempt=step.attempt,
    ).update(state="succeeded", output=output)
    if not updated:
        raise LeaseLostError(step.name)
    run.context[step.name] = output
    OutboxEvent.objects.bulk_create(ctx.pending_events())`,
    hl: [4, 5, 6, 8],
  },
  {
    n: "05",
    title: "Relay publishes, at least once",
    body: "A separate relay claims unpublished rows with SKIP LOCKED, pushes them to the sink and marks them published. A crash re-sends; the dedupe key on the envelope lets consumers drop the repeat.",
    file: "engine/outbox.py",
    code: `ids = (OutboxEvent.objects
       .select_for_update(skip_locked=True)
       .filter(published_at__isnull=True)
       .values_list("id", flat=True)[:batch])

for event in claimed:
    sink.publish(envelope_for(event))
    mark_published(event)`,
    hl: [1, 6],
  },
];

export function Walkthrough() {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [ref, inView] = useInView<HTMLDivElement>(0.35);

  useEffect(() => {
    if (!inView || held || prefersReducedMotion()) return;
    const timer = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), 5200);
    return () => clearTimeout(timer);
  }, [active, inView, held]);

  const step = STEPS[active];

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
      <ol className="relative space-y-1">
        <span aria-hidden className="absolute top-4 bottom-4 left-[19px] w-px bg-border" />
        {STEPS.map((s, i) => {
          const on = i === active;
          return (
            <li key={s.n}>
              <button
                onClick={() => {
                  setActive(i);
                  setHeld(true);
                }}
                aria-current={on ? "step" : undefined}
                className={cn("relative flex w-full gap-4 rounded-xl px-2 py-3 text-left transition-colors", on ? "bg-surface shadow-card ring-1 ring-border" : "hover:bg-surface/60")}
              >
                <span
                  className={cn(
                    "relative z-10 flex size-[24px] shrink-0 items-center justify-center rounded-full border font-mono text-[10px] transition-colors",
                    on ? "border-accent bg-accent text-accent-fg" : i < active ? "border-good/50 bg-surface text-good" : "border-border-strong bg-bg text-fg-subtle",
                  )}
                >
                  {s.n}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[14.5px] font-semibold tracking-tight", on ? "text-fg" : "text-fg-muted")}>{s.title}</span>
                  <span className={cn("grid transition-[grid-template-rows] duration-500", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <span className="overflow-hidden">
                      <span className="mt-1.5 block text-[13.5px] leading-relaxed text-fg-muted">{s.body}</span>
                    </span>
                  </span>
                  {on && !held && inView && (
                    <span aria-hidden className="mt-3 block h-0.5 overflow-hidden rounded-full bg-muted">
                      <span key={active} className="k-progress block h-full bg-accent" />
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="k-frame min-w-0 self-start overflow-hidden rounded-2xl lg:sticky lg:top-24">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-muted" />
            <span className="size-2.5 rounded-full bg-muted" />
            <span className="size-2.5 rounded-full bg-muted" />
          </span>
          <span className="ml-2 font-mono text-[11px] text-fg-subtle">{step.file}</span>
          <span className="ml-auto font-mono text-[11px] text-fg-subtle">
            {step.n} / 0{STEPS.length}
          </span>
        </div>
        <pre key={active} className="ap-rise overflow-x-auto p-4 font-mono text-[12px] leading-[1.75] sm:text-[12.5px]">
          {step.code.split("\n").map((line, i) => (
            <span
              key={i}
              className={cn("-mx-4 block px-4", step.hl.includes(i) ? "bg-accent/10 text-fg shadow-[inset_2px_0_0_var(--accent)]" : "text-fg-muted")}
            >
              {line || " "}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}
