import pytest

from engine import queue
from engine.executor import Executor
from engine.models import DeadLetter, RunState, StepState, WorkflowRun

pytestmark = pytest.mark.django_db


def test_starting_a_run_over_http(client):
    response = client.post(
        "/api/runs/",
        {"workflow": "t_two_step", "input": {"value": 3}, "idempotency_key": "http-1"},
        content_type="application/json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] is True
    assert body["state"] == RunState.PENDING
    assert [s["name"] for s in body["steps"]] == ["first", "second"]


def test_posting_the_same_idempotency_key_returns_the_first_run(client):
    payload = {"workflow": "t_two_step", "input": {}, "idempotency_key": "http-2"}
    first = client.post("/api/runs/", payload, content_type="application/json")
    second = client.post("/api/runs/", payload, content_type="application/json")

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["created"] is False
    assert first.json()["id"] == second.json()["id"]
    assert WorkflowRun.objects.count() == 1


def test_an_unknown_workflow_is_a_400_not_a_500(client):
    response = client.post(
        "/api/runs/",
        {"workflow": "nope", "input": {}},
        content_type="application/json",
    )
    assert response.status_code == 400


def test_run_detail_exposes_steps_context_and_events(client):
    response = client.post(
        "/api/runs/", {"workflow": "t_two_step", "input": {"value": 2}},
        content_type="application/json",
    )
    run_id = response.json()["id"]
    step = queue.claim("worker-a")
    Executor("worker-a").execute(step)

    body = client.get(f"/api/runs/{run_id}/").json()

    assert body["context"] == {"first": {"value": 4}}
    assert [e["topic"] for e in body["events"]] == ["t.first.done"]
    assert dict((s["name"], s["state"]) for s in body["steps"]) == {
        "first": StepState.SUCCEEDED,
        "second": StepState.READY,
    }


def test_runs_can_be_filtered_by_state(client):
    client.post("/api/runs/", {"workflow": "t_two_step"}, content_type="application/json")
    client.post("/api/runs/", {"workflow": "t_flaky"}, content_type="application/json")

    body = client.get("/api/runs/?state=pending").json()
    assert body["count"] == 2

    body = client.get("/api/runs/?workflow=t_flaky").json()
    assert body["count"] == 1


def test_cancelling_over_http(client):
    run_id = client.post(
        "/api/runs/", {"workflow": "t_two_step"}, content_type="application/json"
    ).json()["id"]

    body = client.post(f"/api/runs/{run_id}/cancel/").json()

    assert body["changed"] is True
    assert body["run"]["state"] == RunState.CANCELLED


def test_replaying_a_dead_letter_over_http(client):
    client.post("/api/runs/", {"workflow": "t_poison"}, content_type="application/json")
    step = queue.claim("worker-a")
    Executor("worker-a").execute(step)

    listing = client.get("/api/dead-letters/?open=1").json()
    assert listing["count"] == 1

    dead_id = listing["results"][0]["id"]
    body = client.post(f"/api/dead-letters/{dead_id}/replay/").json()

    assert body["replay_count"] == 1
    assert DeadLetter.objects.get(pk=dead_id).replayed_at is not None


def test_stats_endpoint(client):
    client.post("/api/runs/", {"workflow": "t_two_step"}, content_type="application/json")
    body = client.get("/api/stats/").json()

    assert body["runs"]["pending"] == 1
    assert body["outbox_pending"] == 0
    assert "t_two_step" in body["workflows"]


def test_workflows_endpoint_describes_the_registry(client):
    body = client.get("/api/workflows/").json()
    names = {w["name"] for w in body}

    assert {"t_two_step", "order_fulfilment"} <= names
    order = next(w for w in body if w["name"] == "order_fulfilment")
    assert [s["name"] for s in order["steps"]] == [
        "reserve_stock",
        "charge_payment",
        "issue_invoice",
        "notify_customer",
    ]
