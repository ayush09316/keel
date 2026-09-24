import pytest

from engine import queue
from engine.errors import WorkflowNotRegistered
from engine.executor import Executor
from engine.models import DeadLetter, RunState, StepRun, StepState, WorkflowRun
from engine.service import cancel_run, replay_dead_letter, start_run, stats

pytestmark = pytest.mark.django_db


def test_start_run_arms_only_the_first_step():
    run, created = start_run("t_two_step", {"value": 1})

    assert created is True
    assert run.state == RunState.PENDING
    steps = list(StepRun.objects.filter(run=run).order_by("seq"))
    assert [s.name for s in steps] == ["first", "second"]
    assert [s.state for s in steps] == [StepState.READY, StepState.BLOCKED]
    assert [s.seq for s in steps] == [0, 1]


def test_start_run_is_idempotent_on_its_key():
    first, created_a = start_run("t_two_step", {"value": 1}, idempotency_key="order-1")
    second, created_b = start_run("t_two_step", {"value": 999}, idempotency_key="order-1")

    assert created_a is True
    assert created_b is False
    assert first.id == second.id
    assert WorkflowRun.objects.count() == 1
    assert second.input == {"value": 1}


def test_start_run_rejects_an_unknown_workflow():
    with pytest.raises(WorkflowNotRegistered):
        start_run("t_does_not_exist", {})


def test_step_attempt_limits_come_from_the_declaration():
    run, _ = start_run("t_poison", {})
    assert StepRun.objects.get(run=run).max_attempts == 5


def test_cancelling_stops_the_queue_from_handing_the_run_out():
    run, _ = start_run("t_two_step", {"value": 1})
    cancelled, changed = cancel_run(run.id)

    assert changed is True
    assert cancelled.state == RunState.CANCELLED
    assert queue.claim("worker-a") is None


def test_cancelling_a_finished_run_changes_nothing():
    run, _ = start_run("t_two_step", {"value": 1})
    for _ in range(2):
        step = queue.claim("worker-a")
        Executor("worker-a").execute(step)

    run.refresh_from_db()
    assert run.state == RunState.COMPLETED

    _, changed = cancel_run(run.id)
    assert changed is False


def test_cancelling_mid_flight_makes_the_worker_discard_its_result():
    run, _ = start_run("t_two_step", {"value": 1})
    step = queue.claim("worker-a")
    cancel_run(run.id)

    outcome = Executor("worker-a").execute(step)

    assert outcome.status == "lease_lost"
    run.refresh_from_db()
    assert run.state == RunState.CANCELLED
    assert run.context == {}


def test_replay_resumes_the_run_from_the_buried_step(test_workflows, fast_retries):
    test_workflows.fail_until["wobble"] = 99
    run, _ = start_run("t_flaky", {})
    for _ in range(3):
        step = queue.claim("worker-a")
        Executor("worker-a").execute(step)

    run.refresh_from_db()
    assert run.state == RunState.FAILED
    dead = DeadLetter.objects.get(run=run)

    test_workflows.fail_until["wobble"] = 0
    replay_dead_letter(dead.id)

    run.refresh_from_db()
    assert run.state == RunState.RUNNING
    step = StepRun.objects.get(run=run)
    assert step.state == StepState.READY
    assert step.attempt == 0

    claimed = queue.claim("worker-b")
    assert Executor("worker-b").execute(claimed).status == "succeeded"
    run.refresh_from_db()
    assert run.state == RunState.COMPLETED


def test_replay_unblocks_the_steps_that_were_cancelled_behind_it(test_workflows, fast_retries):
    test_workflows.fail_until["wobble"] = 99
    run, _ = start_run("t_flaky_then_done", {})

    step = queue.claim("worker-a")
    Executor("worker-a").execute(step)

    states = dict(StepRun.objects.filter(run=run).values_list("name", "state"))
    assert states == {"wobble": StepState.DEAD, "after": StepState.CANCELLED}

    dead = DeadLetter.objects.get(run=run)
    replay_dead_letter(dead.id)

    states = dict(StepRun.objects.filter(run=run).values_list("name", "state"))
    assert states == {"wobble": StepState.READY, "after": StepState.BLOCKED}


def test_replay_is_counted():
    run, _ = start_run("t_poison", {})
    step = queue.claim("worker-a")
    Executor("worker-a").execute(step)

    dead = DeadLetter.objects.get(run=run)
    replay_dead_letter(dead.id)
    dead.refresh_from_db()

    assert dead.replay_count == 1
    assert dead.replayed_at is not None


def test_stats_reports_every_state_even_at_zero():
    start_run("t_two_step", {"value": 1})
    snapshot = stats()

    assert snapshot["runs"]["pending"] == 1
    assert snapshot["runs"]["completed"] == 0
    assert snapshot["runs_total"] == 1
    assert snapshot["steps"]["ready"] == 1
    assert "t_two_step" in snapshot["workflows"]
