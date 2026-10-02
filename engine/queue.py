import datetime as dt
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .attempts import expire_attempt, open_attempt
from .models import DeadLetter, RunState, StepRun, StepState, WorkflowRun
from .retry import backoff_seconds

logger = logging.getLogger("keel.queue")


def lease_window(seconds=None):
    seconds = settings.KEEL["LEASE_SECONDS"] if seconds is None else seconds
    return dt.timedelta(seconds=seconds)


def claim(worker_id, lease_seconds=None, now=None):
    now = now or timezone.now()
    expires = now + lease_window(lease_seconds)

    with transaction.atomic():
        step = (
            StepRun.objects.select_for_update(skip_locked=True)
            .filter(state=StepState.READY, run_after__lte=now)
            .order_by("run_after", "created_at")
            .first()
        )
        if step is None:
            return None

        step.state = StepState.RUNNING
        step.attempt += 1
        step.lease_owner = worker_id
        step.lease_expires_at = expires
        step.heartbeat_at = now
        if step.started_at is None:
            step.started_at = now
        step.save(
            update_fields=[
                "state",
                "attempt",
                "lease_owner",
                "lease_expires_at",
                "heartbeat_at",
                "started_at",
            ]
        )
        open_attempt(step, worker_id, now)

    WorkflowRun.objects.filter(pk=step.run_id, state=RunState.PENDING).update(
        state=RunState.RUNNING, started_at=now
    )
    return step


def heartbeat(step_id, worker_id, attempt, lease_seconds=None, now=None):
    now = now or timezone.now()
    return StepRun.objects.filter(
        pk=step_id, state=StepState.RUNNING, lease_owner=worker_id, attempt=attempt
    ).update(lease_expires_at=now + lease_window(lease_seconds), heartbeat_at=now)


def expired_step_ids(now=None, limit=200):
    now = now or timezone.now()
    return list(
        StepRun.objects.filter(state=StepState.RUNNING, lease_expires_at__lt=now)
        .order_by("lease_expires_at")
        .values_list("id", flat=True)[:limit]
    )


def reclaim_expired(now=None, limit=200):
    """Return orphaned steps to the queue.

    A worker that died mid-step leaves its row in `running` with a lease that
    stops being renewed. The attempt it consumed is not refunded, which is what
    stops a step that crashes the process from being retried forever.
    """
    now = now or timezone.now()
    reclaimed, buried = 0, 0

    for step_id in expired_step_ids(now=now, limit=limit):
        with transaction.atomic():
            step = (
                StepRun.objects.select_for_update()
                .filter(pk=step_id, state=StepState.RUNNING, lease_expires_at__lt=now)
                .first()
            )
            if step is None:
                continue
            run = WorkflowRun.objects.select_for_update().get(pk=step.run_id)

            if step.attempt >= step.max_attempts:
                expire_attempt(step, now, buried=True)
                bury(
                    run,
                    step,
                    error="lease expired and no attempts remain (worker presumed dead)",
                    error_type="LeaseExpired",
                    now=now,
                )
                buried += 1
                continue

            expire_attempt(step, now, buried=False)
            delay = backoff_seconds(step.attempt)
            step.state = StepState.READY
            step.lease_owner = None
            step.lease_expires_at = None
            step.reclaimed += 1
            step.run_after = now + dt.timedelta(seconds=delay)
            step.error = "lease expired; requeued by reaper"
            step.error_type = "LeaseExpired"
            step.save(
                update_fields=[
                    "state",
                    "lease_owner",
                    "lease_expires_at",
                    "reclaimed",
                    "run_after",
                    "error",
                    "error_type",
                ]
            )
            reclaimed += 1
            logger.warning(
                "reclaimed %s/%s attempt=%s retry_in=%.1fs",
                run.workflow,
                step.name,
                step.attempt,
                delay,
            )

    return reclaimed, buried


def bury(run, step, error, error_type, now=None):
    """Move a step to the dead-letter queue and fail the run. Caller holds both locks."""
    now = now or timezone.now()

    step.state = StepState.DEAD
    step.lease_owner = None
    step.lease_expires_at = None
    step.finished_at = now
    step.error = error
    step.error_type = error_type
    step.save(
        update_fields=[
            "state",
            "lease_owner",
            "lease_expires_at",
            "finished_at",
            "error",
            "error_type",
        ]
    )

    DeadLetter.objects.update_or_create(
        step=step,
        defaults={
            "run": run,
            "workflow": run.workflow,
            "step_name": step.name,
            "attempts": step.attempt,
            "error": error,
            "error_type": error_type,
            "replayed_at": None,
        },
    )

    StepRun.objects.filter(run=run, state__in=[StepState.BLOCKED, StepState.READY]).update(
        state=StepState.CANCELLED
    )

    run.state = RunState.FAILED
    run.error = f"{step.name}: {error}"
    run.finished_at = now
    run.save(update_fields=["state", "error", "finished_at"])
    logger.error("dead-letter %s/%s after %s attempts", run.workflow, step.name, step.attempt)
