import datetime as dt
import threading

import pytest
from django.db import connection, transaction
from django.utils import timezone

from engine import queue
from engine.models import DeadLetter, RunState, StepRun, StepState
from engine.service import start_run

pytestmark = pytest.mark.django_db


def test_claim_takes_the_first_ready_step_and_leases_it():
    run, _ = start_run("t_two_step", {"value": 3})
    step = queue.claim("worker-a", lease_seconds=30)

    assert step is not None
    assert step.name == "first"
    assert step.state == StepState.RUNNING
    assert step.attempt == 1
    assert step.lease_owner == "worker-a"
    assert step.lease_expires_at > timezone.now()

    run.refresh_from_db()
    assert run.state == RunState.RUNNING


def test_claim_does_not_hand_the_same_step_to_two_workers():
    start_run("t_two_step", {"value": 1})
    first = queue.claim("worker-a")
    second = queue.claim("worker-b")

    assert first is not None
    assert second is None


def test_claim_ignores_steps_scheduled_for_the_future():
    start_run("t_two_step", {"value": 1})
    StepRun.objects.filter(name="first").update(
        run_after=timezone.now() + dt.timedelta(minutes=5)
    )
    assert queue.claim("worker-a") is None


def test_claim_only_sees_the_first_step_of_a_run():
    start_run("t_two_step", {"value": 1})
    assert StepRun.objects.filter(state=StepState.READY).count() == 1
    assert StepRun.objects.filter(state=StepState.BLOCKED).count() == 1


@pytest.mark.django_db(transaction=True)
def test_skip_locked_lets_a_second_worker_past_a_locked_row():
    """Two live connections, two ready steps, one row held under FOR UPDATE.

    Without SKIP LOCKED the second worker blocks on the first worker's lock and
    the pool serialises. This is the test that the claim query is actually
    non-blocking.
    """
    start_run("t_flaky", {}, idempotency_key="lock-a")
    start_run("t_flaky", {}, idempotency_key="lock-b")

    held = threading.Event()
    release = threading.Event()
    locked_id = {}

    def hold_one_row():
        try:
            with transaction.atomic():
                row = (
                    StepRun.objects.select_for_update()
                    .filter(state=StepState.READY)
                    .order_by("run_after", "created_at")
                    .first()
                )
                locked_id["id"] = row.id
                held.set()
                release.wait(timeout=10)
        finally:
            connection.close()

    holder = threading.Thread(target=hold_one_row)
    holder.start()
    assert held.wait(timeout=10)

    try:
        claimed = queue.claim("worker-b", lease_seconds=30)
        assert claimed is not None
        assert claimed.id != locked_id["id"]
    finally:
        release.set()
        holder.join(timeout=10)


def test_heartbeat_extends_only_the_owners_lease():
    start_run("t_two_step", {})
    step = queue.claim("worker-a", lease_seconds=10)
    original = step.lease_expires_at

    assert queue.heartbeat(step.pk, "worker-b", step.attempt, lease_seconds=60) == 0
    assert queue.heartbeat(step.pk, "worker-a", step.attempt, lease_seconds=60) == 1

    step.refresh_from_db()
    assert step.lease_expires_at > original


def test_heartbeat_fails_once_the_attempt_has_moved_on():
    start_run("t_two_step", {})
    step = queue.claim("worker-a", lease_seconds=10)
    StepRun.objects.filter(pk=step.pk).update(attempt=step.attempt + 1)

    assert queue.heartbeat(step.pk, "worker-a", step.attempt) == 0


def test_reaper_requeues_a_step_whose_lease_expired():
    start_run("t_flaky", {})
    step = queue.claim("worker-a", lease_seconds=30)
    StepRun.objects.filter(pk=step.pk).update(
        lease_expires_at=timezone.now() - dt.timedelta(seconds=1)
    )

    reclaimed, buried = queue.reclaim_expired()
    assert (reclaimed, buried) == (1, 0)

    step.refresh_from_db()
    assert step.state == StepState.READY
    assert step.lease_owner is None
    assert step.reclaimed == 1
    assert step.attempt == 1


def test_reaper_does_not_refund_the_attempt_it_consumed():
    start_run("t_flaky", {})
    step = queue.claim("worker-a")
    StepRun.objects.filter(pk=step.pk).update(
        lease_expires_at=timezone.now() - dt.timedelta(seconds=1)
    )
    queue.reclaim_expired()
    step.refresh_from_db()

    assert step.attempt == 1


def test_a_step_that_kills_every_worker_eventually_dies(fast_retries):
    """A poison pill must not be reclaimed forever."""
    run, _ = start_run("t_flaky", {})
    StepRun.objects.filter(run=run).update(max_attempts=2)

    for _ in range(2):
        step = queue.claim("worker-a")
        assert step is not None
        StepRun.objects.filter(pk=step.pk).update(
            lease_expires_at=timezone.now() - dt.timedelta(seconds=1)
        )
        queue.reclaim_expired()

    step = StepRun.objects.get(run=run)
    assert step.state == StepState.DEAD
    assert DeadLetter.objects.filter(step=step).exists()

    run.refresh_from_db()
    assert run.state == RunState.FAILED


def test_reaper_leaves_healthy_leases_alone():
    start_run("t_flaky", {})
    queue.claim("worker-a", lease_seconds=60)
    assert queue.reclaim_expired() == (0, 0)
