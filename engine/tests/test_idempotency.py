import datetime as dt

import pytest
from django.utils import timezone

from engine import queue
from engine.executor import LEASE_LOST, SUCCEEDED, Executor
from engine.models import IdempotencyRecord, StepRun
from engine.service import start_run

pytestmark = pytest.mark.django_db


def gateway_calls(recorder):
    return [c for c in recorder.calls if c[0] == "gateway"]


def test_the_effect_runs_once_across_a_retry(test_workflows, fast_retries):
    test_workflows.fail_until["charge"] = 3
    start_run("t_effectful", {})

    for _ in range(3):
        step = queue.claim("worker-a")
        if step is None:
            break
        Executor("worker-a").execute(step)

    assert len(gateway_calls(test_workflows)) == 1
    assert IdempotencyRecord.objects.count() == 1


def test_the_effect_runs_once_across_two_different_workers(test_workflows, fast_retries):
    """The exact scenario chaos produces: worker A stalls, B redoes the step."""
    start_run("t_effectful", {})

    slow_step = queue.claim("slow-worker", lease_seconds=30)
    Executor("slow-worker").execute(slow_step)

    StepRun.objects.filter(pk=slow_step.pk).update(
        state="running",
        lease_owner="slow-worker",
        lease_expires_at=timezone.now() - dt.timedelta(seconds=1),
        finished_at=None,
    )
    queue.reclaim_expired()

    second = queue.claim("fast-worker", lease_seconds=30)
    outcome = Executor("fast-worker").execute(second)

    assert outcome.status == SUCCEEDED
    assert len(gateway_calls(test_workflows)) == 1
    assert IdempotencyRecord.objects.count() == 1


def test_the_idempotency_key_is_stable_across_attempts(test_workflows, fast_retries):
    test_workflows.fail_until["charge"] = 3
    run, _ = start_run("t_effectful", {})

    for _ in range(3):
        step = queue.claim("worker-a")
        if step is None:
            break
        Executor("worker-a").execute(step)

    key = IdempotencyRecord.objects.get().key
    assert key == f"{run.id}:charge:charge"


def test_a_discarded_result_does_not_discard_the_effect(test_workflows):
    """Committing is rolled back; the money that already moved is not."""
    start_run("t_effectful", {})
    step = queue.claim("slow-worker", lease_seconds=30)
    StepRun.objects.filter(pk=step.pk).update(lease_owner="someone-else")

    outcome = Executor("slow-worker").execute(step)

    assert outcome.status == LEASE_LOST
    assert len(gateway_calls(test_workflows)) == 1
    assert IdempotencyRecord.objects.count() == 1


def test_records_are_scoped_to_a_run(test_workflows):
    run_a, _ = start_run("t_effectful", {}, idempotency_key="a")
    run_b, _ = start_run("t_effectful", {}, idempotency_key="b")

    for _ in range(2):
        step = queue.claim("worker-a")
        Executor("worker-a").execute(step)

    assert len(gateway_calls(test_workflows)) == 2
    assert IdempotencyRecord.objects.count() == 2
    assert set(IdempotencyRecord.objects.values_list("run_id", flat=True)) == {
        run_a.id,
        run_b.id,
    }
