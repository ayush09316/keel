import json
import os
import time
from pathlib import Path

from django.db.models import Count, Sum
from django.utils import timezone

from demo.models import Charge, GatewayCall
from .models import (
    AttemptOutcome,
    DeadLetter,
    OutboxEvent,
    RunState,
    StepAttempt,
    StepRun,
    StepState,
    WorkflowRun,
)

FORMAT_VERSION = 1


def counts(model, field, choices):
    found = {row[field]: row["n"] for row in model.objects.values(field).annotate(n=Count("id"))}
    return {c.value: found.get(c.value, 0) for c in choices}


def counters():
    sums = StepRun.objects.aggregate(
        attempts=Sum("attempt"),
        reclaims=Sum("reclaimed"),
        effects_performed=Sum("effects_performed"),
        effects_replayed=Sum("effects_replayed"),
    )
    return {
        **{k: v or 0 for k, v in sums.items()},
        "ran_twice": StepRun.objects.filter(attempt__gt=1).count(),
        "reclaimed_steps": StepRun.objects.filter(reclaimed__gt=0).count(),
        "fenced": StepAttempt.objects.filter(outcome=AttemptOutcome.FENCED).count(),
        "gateway_calls": GatewayCall.objects.count(),
        "gateway_deduped": GatewayCall.objects.filter(deduped=True).count(),
        "gateway_failed": GatewayCall.objects.filter(failed=True).count(),
        "charges": Charge.objects.count(),
        "charged_twice": Charge.objects.values("order_id")
        .annotate(n=Count("id"))
        .filter(n__gt=1)
        .count(),
        "outbox_pending": OutboxEvent.objects.filter(published_at__isnull=True).count(),
        "outbox_published": OutboxEvent.objects.filter(published_at__isnull=False).count(),
        "dead_letters": DeadLetter.objects.filter(replayed_at__isnull=True).count(),
    }


class Lane:
    def __init__(self, slot, worker_id, pid):
        self.slot = slot
        self.worker_id = worker_id
        self.pid = pid
        self.status = "alive"
        self.ghosts = []

    def replace(self, worker_id, pid):
        self.ghosts = [self.worker_id, *self.ghosts][:4]
        self.worker_id = worker_id
        self.pid = pid
        self.status = "alive"


class ChaosRecorder:
    def __init__(self, path, config, interval=0.5):
        self.path = Path(path)
        self.config = config
        self.interval = interval
        self.started = time.monotonic()
        self.started_at = timezone.now()
        self.events = []
        self.samples = []
        self.lanes = {}
        self.last_sample = None
        self.seen_until = self.started_at

    def elapsed(self):
        return round(time.monotonic() - self.started, 3)

    def offset(self, moment):
        return round((moment - self.started_at).total_seconds(), 3)

    def lane(self, slot, worker_id, pid):
        existing = self.lanes.get(slot)
        if existing is None:
            self.lanes[slot] = Lane(slot, worker_id, pid)
            self.event("spawn", slot=slot, pid=pid, worker=worker_id)
        else:
            existing.replace(worker_id, pid)
            self.event("respawn", slot=slot, pid=pid, worker=worker_id)

    def set_status(self, slot, status):
        self.lanes[slot].status = status

    def event(self, kind, at=None, **detail):
        self.events.append({"t": self.elapsed() if at is None else at, "kind": kind, **detail})

    def holding(self):
        now = timezone.now()
        held = {}
        for row in StepRun.objects.filter(state=StepState.RUNNING).values(
            "lease_owner", "name", "run_id", "attempt", "lease_expires_at", "run__input"
        ):
            lease_in = (
                round((row["lease_expires_at"] - now).total_seconds(), 2)
                if row["lease_expires_at"]
                else None
            )
            held.setdefault(row["lease_owner"], []).append(
                {
                    "run": str(row["run_id"]),
                    "step": row["name"],
                    "attempt": row["attempt"],
                    "order": (row["run__input"] or {}).get("order_id"),
                    "lease_in": lease_in,
                }
            )
        return held

    def attempt_events(self):
        now = timezone.now()
        reclaimed = StepAttempt.objects.filter(
            reclaimed_at__gt=self.seen_until, reclaimed_at__lte=now
        ).values("reclaimed_at", "worker_id", "step__name", "run_id", "attempt", "finished_at")
        for row in reclaimed:
            self.event(
                "reclaim",
                at=self.offset(row["reclaimed_at"]),
                worker=row["worker_id"],
                slot=self.slot_of(row["worker_id"]),
                step=row["step__name"],
                run=str(row["run_id"]),
                attempt=row["attempt"],
                buried=row["finished_at"] is not None,
            )
        fenced = StepAttempt.objects.filter(
            fenced_at__gt=self.seen_until, fenced_at__lte=now
        ).values("fenced_at", "worker_id", "step__name", "run_id", "attempt", "effects_performed")
        for row in fenced:
            self.event(
                "fenced",
                at=self.offset(row["fenced_at"]),
                worker=row["worker_id"],
                slot=self.slot_of(row["worker_id"]),
                step=row["step__name"],
                run=str(row["run_id"]),
                attempt=row["attempt"],
                effects=row["effects_performed"],
            )
        self.seen_until = now

    def slot_of(self, worker_id):
        for lane in self.lanes.values():
            if lane.worker_id == worker_id or worker_id in lane.ghosts:
                return lane.slot
        return None

    def sample(self, force=False):
        now = time.monotonic()
        if not force and self.last_sample is not None and now - self.last_sample < self.interval:
            return None
        self.last_sample = now
        self.attempt_events()
        held = self.holding()
        lanes = []
        for slot in sorted(self.lanes):
            lane = self.lanes[slot]
            steps = held.get(lane.worker_id, [])
            lanes.append(
                {
                    "slot": slot,
                    "pid": lane.pid,
                    "worker": lane.worker_id,
                    "status": lane.status,
                    "step": steps[0] if steps else None,
                    "orphans": [s for ghost in lane.ghosts for s in held.get(ghost, [])],
                }
            )
        snapshot = {
            "t": self.elapsed(),
            "lanes": lanes,
            "steps": counts(StepRun, "state", StepState),
            "runs": counts(WorkflowRun, "state", RunState),
            "counters": counters(),
        }
        self.samples.append(snapshot)
        return snapshot

    def as_dict(self, summary, failures, kills, freezes):
        return {
            "version": FORMAT_VERSION,
            "recorded_at": self.started_at.isoformat(),
            "duration": self.elapsed(),
            "config": self.config,
            "kills": kills,
            "freezes": freezes,
            "events": sorted(self.events, key=lambda e: e["t"]),
            "samples": self.samples,
            "summary": summary,
            "failures": failures,
            "passed": not failures,
        }

    def write(self, summary, failures, kills, freezes):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self.as_dict(summary, failures, kills, freezes), separators=(",", ":")))
        os.replace(tmp, self.path)
        return self.path
