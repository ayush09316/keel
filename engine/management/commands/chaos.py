import os
import random
import signal
import subprocess
import sys
import time

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import connection

from engine.management.commands import verify
from engine.models import OutboxEvent, RunState, WorkflowRun
from engine.recorder import ChaosRecorder
from engine.registry import autodiscover

MANAGED_TABLES = [
    "keel_dead_letter",
    "keel_outbox_event",
    "keel_idempotency_record",
    "keel_step_attempt",
    "keel_step_run",
    "keel_workflow_run",
    "keel_worker",
    "demo_gateway_call",
    "demo_charge",
    "demo_stock_reservation",
    "demo_invoice",
    "demo_notification",
]


class Victim:
    def __init__(self, process, worker_id):
        self.process = process
        self.worker_id = worker_id
        self.frozen_until = None

    @property
    def alive(self):
        return self.process.poll() is None

    @property
    def frozen(self):
        return self.frozen_until is not None


class Command(BaseCommand):
    help = (
        "Start N runs across W workers, then attack them: SIGKILL simulates a crashed pod, "
        "SIGSTOP simulates a stalled one whose lease expires while it is still holding work. "
        "Afterwards every order must still be charged exactly once."
    )

    def add_arguments(self, parser):
        parser.add_argument("--runs", type=int, default=60)
        parser.add_argument("--workers", type=int, default=4)
        parser.add_argument("--kill-every", type=float, default=4.0)
        parser.add_argument("--freeze-every", type=float, default=5.0)
        parser.add_argument("--freeze-for", type=float, default=None)
        parser.add_argument("--duration", type=float, default=120.0)
        parser.add_argument("--lease", type=int, default=6)
        parser.add_argument("--failure-rate", type=float, default=0.15)
        parser.add_argument("--latency-ms", type=int, default=250)
        parser.add_argument("--no-reset", action="store_true")
        parser.add_argument("--no-kill", action="store_true")
        parser.add_argument("--no-freeze", action="store_true")
        parser.add_argument("--record", default=None)
        parser.add_argument("--no-record", action="store_true")
        parser.add_argument("--sample-every", type=float, default=0.5)

    def truncate(self):
        with connection.cursor() as cursor:
            cursor.execute(f"TRUNCATE {', '.join(MANAGED_TABLES)} RESTART IDENTITY CASCADE")

    def child_env(self, options):
        env = os.environ.copy()
        env["KEEL_DEMO_FAILURE_RATE"] = str(options["failure_rate"])
        env["KEEL_DEMO_LATENCY_MS"] = str(options["latency_ms"])
        env["KEEL_LEASE_SECONDS"] = str(options["lease"])
        env["KEEL_HEARTBEAT_SECONDS"] = str(max(options["lease"] // 3, 1))
        env["KEEL_LOG_LEVEL"] = os.environ.get("KEEL_CHAOS_CHILD_LOG", "WARNING")
        return env

    def spawn_worker(self, index, options, env):
        worker_id = f"chaos-{index}-{random.randint(1000, 9999)}"
        return Victim(
            subprocess.Popen(
                [
                    sys.executable,
                    "manage.py",
                    "runworker",
                    "--id",
                    worker_id,
                    "--lease",
                    str(options["lease"]),
                ],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            ),
            worker_id,
        )

    def recorder_for(self, options, freeze_for):
        if options["no_record"]:
            return None
        path = options["record"] or settings.KEEL["CHAOS_RECORDING_PATH"]
        config = {
            key: options[key]
            for key in (
                "runs",
                "workers",
                "kill_every",
                "freeze_every",
                "duration",
                "lease",
                "failure_rate",
                "latency_ms",
            )
        }
        config["freeze_for"] = freeze_for
        return ChaosRecorder(path, config, interval=options["sample_every"])

    def spawn_relay(self, env):
        return subprocess.Popen(
            [sys.executable, "manage.py", "runrelay", "--interval", "0.3"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def pending_runs(self):
        return WorkflowRun.objects.filter(
            state__in=[RunState.PENDING, RunState.RUNNING]
        ).count()

    def handle(self, *args, **options):
        autodiscover()

        if not options["no_reset"]:
            self.truncate()
            self.stdout.write("reset all tables")

        call_command("seed_demo", count=options["runs"], prefix="chaos", verbosity=0)
        self.stdout.write(f"queued {options['runs']} runs")

        freeze_for = options["freeze_for"] or options["lease"] * 1.8
        env = self.child_env(options)
        recorder = self.recorder_for(options, freeze_for)
        workers = [self.spawn_worker(i, options, env) for i in range(options["workers"])]
        relay = self.spawn_relay(env)
        if recorder:
            for slot, victim in enumerate(workers):
                recorder.lane(slot, victim.worker_id, victim.process.pid)
            recorder.sample(force=True)
        self.stdout.write(
            f"spawned {len(workers)} workers + relay "
            f"(lease={options['lease']}s step_latency={options['latency_ms']}ms "
            f"failure_rate={options['failure_rate']})"
        )

        started = time.monotonic()
        next_kill = started + options["kill_every"]
        next_freeze = started + options["freeze_every"]
        stop_attacking_at = started + options["duration"] * 0.6
        kills = freezes = 0
        spawn_index = options["workers"]

        try:
            while time.monotonic() - started < options["duration"]:
                now = time.monotonic()

                for slot, victim in enumerate(workers):
                    if victim.frozen and now >= victim.frozen_until and victim.alive:
                        victim.process.send_signal(signal.SIGCONT)
                        victim.frozen_until = None
                        if recorder:
                            recorder.set_status(slot, "alive")
                            recorder.event(
                                "sigcont", slot=slot, pid=victim.process.pid, worker=victim.worker_id
                            )

                if recorder:
                    recorder.sample()

                pending = self.pending_runs()
                if pending == 0:
                    self.stdout.write("all runs reached a terminal state")
                    break

                attacking = now < stop_attacking_at

                if attacking and not options["no_kill"] and now >= next_kill:
                    candidates = [i for i, v in enumerate(workers) if v.alive and not v.frozen]
                    if candidates:
                        index = random.choice(candidates)
                        pid = workers[index].process.pid
                        held = recorder.holding().get(workers[index].worker_id) if recorder else None
                        workers[index].process.send_signal(signal.SIGKILL)
                        kills += 1
                        if recorder:
                            recorder.event(
                                "sigkill",
                                slot=index,
                                pid=pid,
                                worker=workers[index].worker_id,
                                held=held[0] if held else None,
                                in_flight=pending,
                            )
                        self.stdout.write(
                            self.style.WARNING(
                                f"  SIGKILL pid={pid}  ({pending} runs in flight)"
                            )
                        )
                        workers[index] = self.spawn_worker(spawn_index, options, env)
                        spawn_index += 1
                        if recorder:
                            recorder.lane(
                                index, workers[index].worker_id, workers[index].process.pid
                            )
                    next_kill = now + options["kill_every"]

                if attacking and not options["no_freeze"] and now >= next_freeze:
                    candidates = [i for i, v in enumerate(workers) if v.alive and not v.frozen]
                    if len(candidates) > 1:
                        index = random.choice(candidates)
                        held = recorder.holding().get(workers[index].worker_id) if recorder else None
                        workers[index].process.send_signal(signal.SIGSTOP)
                        workers[index].frozen_until = now + freeze_for
                        freezes += 1
                        if recorder:
                            recorder.set_status(index, "frozen")
                            recorder.event(
                                "sigstop",
                                slot=index,
                                pid=workers[index].process.pid,
                                worker=workers[index].worker_id,
                                held=held[0] if held else None,
                                freeze_for=freeze_for,
                            )
                        self.stdout.write(
                            self.style.WARNING(
                                f"  SIGSTOP pid={workers[index].process.pid} for {freeze_for:.0f}s "
                                f"(lease is {options['lease']}s - it will lose the step)"
                            )
                        )
                    next_freeze = now + options["freeze_every"]

                time.sleep(0.25 if recorder else 0.4)
        finally:
            for slot, victim in enumerate(workers):
                if victim.frozen and victim.alive:
                    victim.process.send_signal(signal.SIGCONT)
                    victim.frozen_until = None
                    if recorder:
                        recorder.set_status(slot, "alive")
                        recorder.event(
                            "sigcont", slot=slot, pid=victim.process.pid, worker=victim.worker_id
                        )

            self.stdout.write("draining...")
            if recorder:
                recorder.event("drain")
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline and (
                self.pending_runs() or OutboxEvent.objects.filter(published_at__isnull=True).exists()
            ):
                if recorder:
                    recorder.sample()
                time.sleep(0.5)

            for process in [*[v.process for v in workers], relay]:
                if process.poll() is None:
                    process.terminate()
            for process in [*[v.process for v in workers], relay]:
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()

        if recorder:
            recorder.sample(force=True)
            for slot in recorder.lanes:
                recorder.set_status(slot, "stopped")
            recorder.event("stop")
            failures, _ = verify.Command().collect_failures(
                {"expect_runs": options["runs"], "require_published": True}
            )
            path = recorder.write(verify.summarise(), failures, kills, freezes)
            self.stdout.write(f"recorded timeline to {path}")

        self.stdout.write("")
        self.stdout.write(
            self.style.MIGRATE_HEADING(f"chaos summary: {kills} SIGKILL, {freezes} SIGSTOP")
        )
        call_command("verify", expect_runs=options["runs"], require_published=True)
