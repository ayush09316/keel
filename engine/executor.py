import datetime as dt
import json
import logging
import traceback
from dataclasses import dataclass

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .context import StepContext
from .errors import LeaseLostError, NonRetryableError
from .models import OutboxEvent, RunState, StepRun, StepState, WorkflowRun
from .queue import bury
from .registry import registry
from .retry import backoff_seconds

logger = logging.getLogger("keel.executor")

SUCCEEDED = "succeeded"
RETRY = "retry"
DEAD = "dead"
LEASE_LOST = "lease_lost"

MAX_ERROR_CHARS = 4000


@dataclass
class Outcome:
    status: str
    step_name: str
    run_id: str
    attempt: int
    error: str = ""
    delay: float = 0.0
    effects_performed: int = 0
    effects_replayed: int = 0
    events: int = 0


def describe_error(exc):
    text = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    return type(exc).__name__, text[-MAX_ERROR_CHARS:]


def ensure_json(value, step_name):
    try:
        json.dumps(value)
    except (TypeError, ValueError) as exc:
        raise NonRetryableError(
            f"step {step_name!r} returned a value that is not JSON serialisable: {exc}"
        ) from exc
    return value


class Executor:
    def __init__(self, worker_id):
        self.worker_id = worker_id

    def execute(self, step):
        run = WorkflowRun.objects.get(pk=step.run_id)
        flow = registry.get(run.workflow)
        ctx = StepContext(run, step, flow)
        handler = flow.handler(step.name)

        logger.info(
            "start %s/%s attempt=%d/%d run=%s",
            run.workflow,
            step.name,
            step.attempt,
            step.max_attempts,
            run.id,
        )

        try:
            output = handler(ctx)
            output = ensure_json(output, step.name)
        except Exception as exc:  # noqa: BLE001 - every handler failure is data here
            return self.commit_failure(run, step, ctx, exc)

        return self.commit_success(run, step, ctx, output)

    def guard(self, step):
        return StepRun.objects.filter(
            pk=step.pk,
            state=StepState.RUNNING,
            lease_owner=self.worker_id,
            attempt=step.attempt,
        )

    def commit_success(self, run, step, ctx, output):
        now = timezone.now()
        try:
            with transaction.atomic():
                locked_run = WorkflowRun.objects.select_for_update().get(pk=run.pk)
                updated = self.guard(step).update(
                    state=StepState.SUCCEEDED,
                    output=output,
                    finished_at=now,
                    lease_owner=None,
                    lease_expires_at=None,
                    error="",
                    error_type="",
                    effects_performed=F("effects_performed") + len(ctx._effects_performed),
                    effects_replayed=F("effects_replayed") + len(ctx._effects_replayed),
                )
                if not updated:
                    raise LeaseLostError(step.name)

                context = dict(locked_run.context or {})
                context[step.name] = output
                locked_run.context = context

                next_step = (
                    StepRun.objects.filter(
                        run=locked_run, seq__gt=step.seq, state=StepState.BLOCKED
                    )
                    .order_by("seq")
                    .first()
                )
                if next_step is not None:
                    next_step.state = StepState.READY
                    next_step.run_after = now
                    next_step.save(update_fields=["state", "run_after"])
                    locked_run.state = RunState.RUNNING
                    locked_run.save(update_fields=["context", "state"])
                else:
                    locked_run.state = RunState.COMPLETED
                    locked_run.finished_at = now
                    locked_run.save(update_fields=["context", "state", "finished_at"])

                pending = ctx.pending_events()
                if pending:
                    OutboxEvent.objects.bulk_create(
                        [
                            OutboxEvent(
                                run=locked_run,
                                step_name=step.name,
                                topic=e.topic,
                                payload=e.payload,
                                dedupe_key=e.dedupe_key,
                            )
                            for e in pending
                        ],
                        ignore_conflicts=True,
                    )
        except LeaseLostError:
            logger.warning(
                "lease lost on %s/%s attempt=%d - discarding result",
                run.workflow,
                step.name,
                step.attempt,
            )
            return Outcome(LEASE_LOST, step.name, str(run.id), step.attempt)

        logger.info("ok    %s/%s attempt=%d", run.workflow, step.name, step.attempt)
        return Outcome(
            SUCCEEDED,
            step.name,
            str(run.id),
            step.attempt,
            effects_performed=len(ctx._effects_performed),
            effects_replayed=len(ctx._effects_replayed),
            events=len(ctx.pending_events()),
        )

    def commit_failure(self, run, step, ctx, exc):
        now = timezone.now()
        error_type, error_text = describe_error(exc)
        permanent = isinstance(exc, NonRetryableError)

        try:
            with transaction.atomic():
                locked_run = WorkflowRun.objects.select_for_update().get(pk=run.pk)
                locked_step = (
                    StepRun.objects.select_for_update()
                    .filter(
                        pk=step.pk,
                        state=StepState.RUNNING,
                        lease_owner=self.worker_id,
                        attempt=step.attempt,
                    )
                    .first()
                )
                if locked_step is None:
                    raise LeaseLostError(step.name)

                exhausted = locked_step.attempt >= locked_step.max_attempts
                if permanent or exhausted:
                    reason = "non-retryable" if permanent else "attempts exhausted"
                    bury(
                        locked_run,
                        locked_step,
                        error=f"{reason}: {error_text}",
                        error_type=error_type,
                        now=now,
                    )
                    return Outcome(
                        DEAD, step.name, str(run.id), step.attempt, error=error_type
                    )

                delay = backoff_seconds(locked_step.attempt)
                locked_step.state = StepState.READY
                locked_step.lease_owner = None
                locked_step.lease_expires_at = None
                locked_step.run_after = now + dt.timedelta(seconds=delay)
                locked_step.error = error_text
                locked_step.error_type = error_type
                locked_step.effects_performed += len(ctx._effects_performed)
                locked_step.effects_replayed += len(ctx._effects_replayed)
                locked_step.save(
                    update_fields=[
                        "state",
                        "lease_owner",
                        "lease_expires_at",
                        "run_after",
                        "error",
                        "error_type",
                        "effects_performed",
                        "effects_replayed",
                    ]
                )
        except LeaseLostError:
            logger.warning("lease lost on %s/%s during failure commit", run.workflow, step.name)
            return Outcome(LEASE_LOST, step.name, str(run.id), step.attempt)

        logger.warning(
            "fail  %s/%s attempt=%d/%d %s retry_in=%.1fs",
            run.workflow,
            step.name,
            step.attempt,
            step.max_attempts,
            error_type,
            delay,
        )
        return Outcome(
            RETRY, step.name, str(run.id), step.attempt, error=error_type, delay=delay
        )
