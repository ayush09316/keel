import datetime as dt
import logging

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.utils import timezone

from .models import (
    DeadLetter,
    OutboxEvent,
    RunState,
    StepRun,
    StepState,
    Worker,
    WorkflowRun,
)
from .registry import registry

logger = logging.getLogger("keel.service")


def start_run(workflow_name, payload=None, idempotency_key=None):
    """Create a run and arm its first step. Returns (run, created)."""
    flow = registry.get(workflow_name)
    payload = payload or {}
    now = timezone.now()

    if idempotency_key:
        existing = WorkflowRun.objects.filter(idempotency_key=idempotency_key).first()
        if existing is not None:
            return existing, False

    try:
        with transaction.atomic():
            run = WorkflowRun.objects.create(
                workflow=workflow_name,
                input=payload,
                idempotency_key=idempotency_key or None,
                state=RunState.PENDING,
            )
            StepRun.objects.bulk_create(
                [
                    StepRun(
                        run=run,
                        name=spec.name,
                        seq=index,
                        max_attempts=spec.max_attempts,
                        state=StepState.READY if index == 0 else StepState.BLOCKED,
                        run_after=now,
                    )
                    for index, spec in enumerate(flow.steps)
                ]
            )
    except IntegrityError:
        existing = WorkflowRun.objects.filter(idempotency_key=idempotency_key).first()
        if existing is None:
            raise
        return existing, False

    logger.info("queued %s run=%s steps=%d", workflow_name, run.id, len(flow.steps))
    return run, True


def cancel_run(run_id):
    now = timezone.now()
    with transaction.atomic():
        run = WorkflowRun.objects.select_for_update().get(pk=run_id)
        if run.is_terminal:
            return run, False

        StepRun.objects.filter(run=run).exclude(
            state__in=[StepState.SUCCEEDED, StepState.DEAD, StepState.CANCELLED]
        ).update(state=StepState.CANCELLED, lease_owner=None, lease_expires_at=None)

        run.state = RunState.CANCELLED
        run.finished_at = now
        run.error = "cancelled by operator"
        run.save(update_fields=["state", "finished_at", "error"])
    logger.info("cancelled run=%s", run_id)
    return run, True


def replay_dead_letter(dead_letter_id, reset_attempts=True):
    """Re-arm a buried step and resume the run from exactly that point."""
    now = timezone.now()
    with transaction.atomic():
        dead = DeadLetter.objects.select_for_update().select_related("step").get(pk=dead_letter_id)
        run = WorkflowRun.objects.select_for_update().get(pk=dead.run_id)
        step = StepRun.objects.select_for_update().get(pk=dead.step_id)

        step.state = StepState.READY
        if reset_attempts:
            step.attempt = 0
        step.run_after = now
        step.lease_owner = None
        step.lease_expires_at = None
        step.error = ""
        step.error_type = ""
        step.finished_at = None
        step.save(
            update_fields=[
                "state",
                "attempt",
                "run_after",
                "lease_owner",
                "lease_expires_at",
                "error",
                "error_type",
                "finished_at",
            ]
        )

        StepRun.objects.filter(run=run, state=StepState.CANCELLED, seq__gt=step.seq).update(
            state=StepState.BLOCKED
        )

        run.state = RunState.RUNNING
        run.error = ""
        run.finished_at = None
        run.save(update_fields=["state", "error", "finished_at"])

        dead.replayed_at = now
        dead.replay_count += 1
        dead.save(update_fields=["replayed_at", "replay_count"])

    logger.info("replayed dlq=%s step=%s run=%s", dead_letter_id, dead.step_name, run.id)
    return dead


def stats():
    run_counts = {
        row["state"]: row["n"]
        for row in WorkflowRun.objects.values("state").annotate(n=Count("id"))
    }
    step_counts = {
        row["state"]: row["n"] for row in StepRun.objects.values("state").annotate(n=Count("id"))
    }
    stale_before = timezone.now() - dt.timedelta(seconds=60)
    return {
        "runs": {s.value: run_counts.get(s.value, 0) for s in RunState},
        "runs_total": sum(run_counts.values()),
        "steps": {s.value: step_counts.get(s.value, 0) for s in StepState},
        "dead_letters_open": DeadLetter.objects.filter(replayed_at__isnull=True).count(),
        "outbox_pending": OutboxEvent.objects.filter(published_at__isnull=True).count(),
        "outbox_published": OutboxEvent.objects.filter(published_at__isnull=False).count(),
        "workers_alive": Worker.objects.filter(last_seen_at__gte=stale_before).count(),
        "workflows": registry.names(),
    }
