import datetime as dt

import pytest
from django.utils import timezone

from engine import queue
from engine.executor import LEASE_LOST, SUCCEEDED, Executor
from engine.models import AttemptOutcome, StepAttempt, StepRun
from engine.service import start_run

pytestmark = pytest.mark.django_db


def expire(step):
    StepRun.objects.filter(pk=step.pk).update(
        lease_expires_at=timezone.now() - dt.timedelta(seconds=1)
    )


def test_a_claim_opens_an_attempt_and_a_commit_closes_it():
    start_run("t_two_step", {"value": 2})
    step = queue.claim("worker-a")

    opened = StepAttempt.objects.get()
    assert (opened.attempt, opened.worker_id, opened.outcome) == (1, "worker-a", "running")

    Executor("worker-a").execute(step)

    closed = StepAttempt.objects.get()
    assert closed.outcome == AttemptOutcome.SUCCEEDED
    assert closed.finished_at is not None
    assert closed.events == 1


def test_a_failed_attempt_keeps_its_error_and_the_retry_gets_its_own_row(
    test_workflows, fast_retries
):
    test_workflows.fail_until["wobble"] = 2
    start_run("t_flaky", {})
    for _ in range(2):
        Executor("worker-a").execute(queue.claim("worker-a"))

    first, second = StepAttempt.objects.order_by("id")
    assert first.outcome == AttemptOutcome.RETRY
    assert first.error_type == "RuntimeError"
    assert first.error == "RuntimeError: boom on attempt 1"
    assert second.outcome == AttemptOutcome.SUCCEEDED


def test_a_buried_attempt_is_marked_dead(test_workflows):
    start_run("t_poison", {})
    Executor("worker-a").execute(queue.claim("worker-a"))

    assert StepAttempt.objects.get().outcome == AttemptOutcome.DEAD


def test_a_stalled_worker_is_recorded_as_reclaimed_then_fenced(test_workflows, fast_retries):
    start_run("t_effectful", {})
    stale = queue.claim("stalled-worker")
    expire(stale)
    queue.reclaim_expired()

    expired = StepAttempt.objects.get()
    assert expired.outcome == AttemptOutcome.LEASE_EXPIRED
    assert expired.reclaimed_at is not None

    fresh = queue.claim("worker-b")
    assert Executor("stalled-worker").execute(stale).status == LEASE_LOST
    assert Executor("worker-b").execute(fresh).status == SUCCEEDED

    fenced, served = StepAttempt.objects.order_by("id")
    assert fenced.outcome == AttemptOutcome.FENCED
    assert fenced.worker_id == "stalled-worker"
    assert fenced.effects_performed == 1
    assert served.outcome == AttemptOutcome.SUCCEEDED
    assert served.effects_replayed == 1


def test_the_reaper_marks_a_final_expired_attempt_as_finished(fast_retries):
    start_run("t_flaky_then_done", {})
    step = queue.claim("doomed")
    expire(step)
    queue.reclaim_expired()

    row = StepAttempt.objects.get()
    assert row.outcome == AttemptOutcome.LEASE_EXPIRED
    assert row.finished_at is not None


def test_replay_starts_a_fresh_attempt_row_without_touching_history(client, test_workflows):
    start_run("t_poison", {})
    Executor("worker-a").execute(queue.claim("worker-a"))
    dead_id = client.get("/api/dead-letters/?open=1").json()["results"][0]["id"]
    client.post(f"/api/dead-letters/{dead_id}/replay/")

    queue.claim("worker-b")

    outcomes = list(StepAttempt.objects.order_by("id").values_list("attempt", "outcome"))
    assert outcomes == [(1, "dead"), (1, "running")]
