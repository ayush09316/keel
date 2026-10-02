import logging

from django.db import DatabaseError

from .models import AttemptOutcome, StepAttempt

logger = logging.getLogger("keel.attempts")


def summary_line(text, limit=500):
    lines = [line for line in (text or "").strip().splitlines() if line.strip()]
    return (lines[-1].strip() if lines else "")[:limit]


def open_attempt(step, worker_id, now):
    StepAttempt.objects.create(
        run_id=step.run_id,
        step_id=step.pk,
        attempt=step.attempt,
        worker_id=worker_id,
        started_at=now,
    )


def current(step, worker_id=None, outcomes=(AttemptOutcome.RUNNING,)):
    qs = StepAttempt.objects.filter(step_id=step.pk, attempt=step.attempt, outcome__in=outcomes)
    if worker_id is not None:
        qs = qs.filter(worker_id=worker_id)
    return qs.order_by("-id").values_list("id", flat=True).first()


def close_attempt(step, worker_id, outcome, now, **fields):
    attempt_id = current(step, worker_id)
    if attempt_id is None:
        return 0
    return StepAttempt.objects.filter(pk=attempt_id).update(
        outcome=outcome, finished_at=now, **fields
    )


def expire_attempt(step, now, buried):
    attempt_id = current(step)
    if attempt_id is None:
        return 0
    fields = {"outcome": AttemptOutcome.LEASE_EXPIRED, "reclaimed_at": now}
    if buried:
        fields["finished_at"] = now
    return StepAttempt.objects.filter(pk=attempt_id).update(**fields)


def fence_attempt(step, worker_id, now, effects_performed=0, effects_replayed=0):
    try:
        attempt_id = current(
            step,
            worker_id,
            outcomes=(AttemptOutcome.RUNNING, AttemptOutcome.LEASE_EXPIRED),
        )
        if attempt_id is None:
            return 0
        return StepAttempt.objects.filter(pk=attempt_id).update(
            outcome=AttemptOutcome.FENCED,
            fenced_at=now,
            finished_at=now,
            effects_performed=effects_performed,
            effects_replayed=effects_replayed,
        )
    except DatabaseError:
        logger.warning("could not record fenced attempt for step=%s", step.pk, exc_info=True)
        return 0
