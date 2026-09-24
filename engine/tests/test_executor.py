import datetime as dt

import pytest
from django.utils import timezone

from engine import queue
from engine.executor import DEAD, LEASE_LOST, RETRY, SUCCEEDED, Executor
from engine.models import DeadLetter, OutboxEvent, RunState, StepRun, StepState
from engine.service import start_run

pytestmark = pytest.mark.django_db


def run_one(worker_id="worker-a", lease_seconds=30):
    step = queue.claim(worker_id, lease_seconds=lease_seconds)
    assert step is not None
    return Executor(worker_id).execute(step)


def test_a_successful_step_arms_the_next_one_and_stores_its_output():
    run, _ = start_run("t_two_step", {"value": 5})
    outcome = run_one()

    assert outcome.status == SUCCEEDED
    run.refresh_from_db()
    assert run.context == {"first": {"value": 10}}
    assert run.state == RunState.RUNNING

    states = dict(StepRun.objects.filter(run=run).values_list("name", "state"))
    assert states == {"first": StepState.SUCCEEDED, "second": StepState.READY}


def test_the_run_completes_when_the_last_step_succeeds():
    run, _ = start_run("t_two_step", {"value": 5})
    run_one()
    run_one()

    run.refresh_from_db()
    assert run.state == RunState.COMPLETED
    assert run.finished_at is not None
    assert run.context == {"first": {"value": 10}, "second": {"total": 11}}


def test_emitted_events_land_in_the_outbox_with_the_step_commit():
    run, _ = start_run("t_two_step", {"value": 2})
    run_one()

    events = list(OutboxEvent.objects.filter(run=run).values_list("topic", flat=True))
    assert events == ["t.first.done"]
    assert OutboxEvent.objects.get(run=run).published_at is None


def test_a_failing_step_is_rescheduled_not_lost(test_workflows, fast_retries):
    test_workflows.fail_until["wobble"] = 3
    run, _ = start_run("t_flaky", {})

    outcome = run_one()
    assert outcome.status == RETRY

    step = StepRun.objects.get(run=run)
    assert step.state == StepState.READY
    assert step.attempt == 1
    assert step.lease_owner is None
    assert "boom on attempt 1" in step.error

    run.refresh_from_db()
    assert run.state == RunState.RUNNING


def test_a_step_succeeds_once_the_upstream_recovers(test_workflows, fast_retries):
    test_workflows.fail_until["wobble"] = 3
    run, _ = start_run("t_flaky", {})

    assert run_one().status == RETRY
    assert run_one().status == RETRY
    assert run_one().status == SUCCEEDED

    run.refresh_from_db()
    assert run.state == RunState.COMPLETED
    assert run.context["wobble"] == {"attempt": 3}


def test_exhausting_the_attempts_buries_the_step(test_workflows, fast_retries):
    test_workflows.fail_until["wobble"] = 99
    run, _ = start_run("t_flaky", {})

    assert run_one().status == RETRY
    assert run_one().status == RETRY
    assert run_one().status == DEAD

    step = StepRun.objects.get(run=run)
    assert step.state == StepState.DEAD
    run.refresh_from_db()
    assert run.state == RunState.FAILED

    dead = DeadLetter.objects.get(run=run)
    assert dead.attempts == 3
    assert dead.error_type == "RuntimeError"


def test_a_non_retryable_error_skips_the_remaining_attempts(test_workflows):
    run, _ = start_run("t_poison", {})
    outcome = run_one()

    assert outcome.status == DEAD
    assert len(test_workflows.calls) == 1

    step = StepRun.objects.get(run=run)
    assert step.state == StepState.DEAD
    assert step.attempt == 1
    assert step.max_attempts == 5
    assert DeadLetter.objects.get(run=run).error_type == "NonRetryableError"


def test_a_worker_that_lost_its_lease_cannot_commit_its_result(fast_retries):
    """The stalled-worker case: another worker already redid the step."""
    run, _ = start_run("t_two_step", {"value": 4})
    step = queue.claim("slow-worker", lease_seconds=30)

    StepRun.objects.filter(pk=step.pk).update(
        lease_expires_at=timezone.now() - dt.timedelta(seconds=1)
    )
    queue.reclaim_expired()
    queue.claim("fast-worker", lease_seconds=30)

    outcome = Executor("slow-worker").execute(step)

    assert outcome.status == LEASE_LOST
    run.refresh_from_db()
    assert run.context == {}
    assert OutboxEvent.objects.filter(run=run).count() == 0
    assert StepRun.objects.get(pk=step.pk).lease_owner == "fast-worker"


def test_a_lost_lease_also_discards_the_failure(test_workflows, fast_retries):
    test_workflows.fail_until["wobble"] = 99
    run, _ = start_run("t_flaky", {})
    step = queue.claim("slow-worker", lease_seconds=30)

    StepRun.objects.filter(pk=step.pk).update(lease_owner="someone-else")

    outcome = Executor("slow-worker").execute(step)
    assert outcome.status == LEASE_LOST
    assert not DeadLetter.objects.filter(run=run).exists()


def test_a_step_returning_something_unserialisable_dies_immediately():
    run, _ = start_run("t_unserialisable", {})
    outcome = run_one()

    assert outcome.status == DEAD
    assert StepRun.objects.get(run=run).attempt == 1
    assert DeadLetter.objects.get(run=run).error_type == "NonRetryableError"


def test_effect_counters_record_what_the_step_actually_did(test_workflows, fast_retries):
    test_workflows.fail_until["charge"] = 2
    run, _ = start_run("t_effectful", {})

    assert run_one().status == RETRY
    assert run_one().status == SUCCEEDED

    step = StepRun.objects.get(run=run)
    assert step.effects_performed == 1
    assert step.effects_replayed == 1
    assert [c for c in test_workflows.calls if c[0] == "gateway"].__len__() == 1
