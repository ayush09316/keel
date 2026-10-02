import json

import pytest

from engine import queue
from engine.executor import Executor
from engine.models import WorkflowRun
from engine.service import start_run

pytestmark = pytest.mark.django_db


@pytest.fixture
def readonly(settings):
    settings.KEEL = {**settings.KEEL, "READONLY": True}
    return settings


@pytest.fixture
def recordings(settings, tmp_path):
    latest = tmp_path / "latest.json"
    sample = tmp_path / "sample.json"
    settings.KEEL = {
        **settings.KEEL,
        "CHAOS_RECORDING_PATH": str(latest),
        "CHAOS_SAMPLE_PATH": str(sample),
    }
    return latest, sample


def test_run_detail_lists_every_attempt_per_step(client, test_workflows, fast_retries):
    test_workflows.fail_until["wobble"] = 2
    run, _ = start_run("t_flaky", {})
    for _ in range(2):
        Executor("worker-a").execute(queue.claim("worker-a"))

    step = client.get(f"/api/runs/{run.id}/").json()["steps"][0]

    assert [(a["attempt"], a["outcome"], a["worker_id"]) for a in step["attempts"]] == [
        (1, "retry", "worker-a"),
        (2, "succeeded", "worker-a"),
    ]


def test_run_detail_links_a_buried_step_to_its_dead_letter(client, test_workflows):
    run, _ = start_run("t_poison", {})
    Executor("worker-a").execute(queue.claim("worker-a"))

    step = client.get(f"/api/runs/{run.id}/").json()["steps"][0]

    assert step["dead_letter"]["replayed_at"] is None
    assert step["dead_letter"]["id"] == client.get("/api/dead-letters/").json()["results"][0]["id"]


def test_runs_can_be_found_by_id_prefix_or_order_id(client):
    run, _ = start_run("t_two_step", {"order_id": "ord-777"})
    start_run("t_two_step", {"order_id": "ord-123"})

    by_prefix = client.get(f"/api/runs/?q={str(run.id)[:6]}").json()
    by_order = client.get("/api/runs/?q=777").json()

    assert [r["id"] for r in by_prefix["results"]] == [str(run.id)]
    assert [r["id"] for r in by_order["results"]] == [str(run.id)]


def test_workers_report_the_leases_they_hold(client):
    from engine.worker import WorkerLoop

    loop = WorkerLoop(worker_id="w-1", verbose=False)
    loop.register()
    start_run("t_two_step", {})
    queue.claim("w-1")

    worker = client.get("/api/workers/").json()["results"][0]

    assert worker["leases"] == 1
    assert worker["held"]["step"] == "first"


def test_throughput_buckets_finished_attempts_per_worker(client):
    start_run("t_two_step", {})
    Executor("w-1").execute(queue.claim("w-1"))
    Executor("w-2").execute(queue.claim("w-2"))

    body = client.get("/api/workers/throughput/").json()

    assert sum(body["total"]) == 2
    assert body["total"][-1] == 2
    assert set(body["workers"]) == {"w-1", "w-2"}


def test_outbox_can_be_filtered_by_publish_state(client):
    start_run("t_two_step", {})
    Executor("w-1").execute(queue.claim("w-1"))

    pending = client.get("/api/outbox/?state=pending").json()
    published = client.get("/api/outbox/?state=published").json()

    assert pending["count"] == 1
    assert pending["results"][0]["workflow"] == "t_two_step"
    assert published["count"] == 0


def test_chaos_endpoint_prefers_the_latest_recording(client, recordings):
    latest, sample = recordings
    sample.write_text(json.dumps({"summary": {"charges": 1}}))
    latest.write_text(json.dumps({"summary": {"charges": 60}}))

    body = client.get("/api/chaos/latest/").json()

    assert body["source"] == "latest"
    assert body["summary"]["charges"] == 60


def test_chaos_endpoint_falls_back_to_the_committed_sample(client, recordings):
    _, sample = recordings
    sample.write_text(json.dumps({"summary": {"charges": 1}}))

    body = client.get("/api/chaos/latest/").json()

    assert body["source"] == "sample"


def test_chaos_endpoint_is_a_404_when_nothing_was_recorded(client, recordings):
    assert client.get("/api/chaos/latest/").status_code == 404


def test_meta_reports_readonly_off_by_default(client):
    assert client.get("/api/meta/").json()["readonly"] is False


def test_readonly_blocks_every_mutation_with_a_clear_message(client, readonly):
    response = client.post(
        "/api/runs/", {"workflow": "t_two_step"}, content_type="application/json"
    )

    assert response.status_code == 403
    assert "read-only demo" in response.json()["detail"]
    assert WorkflowRun.objects.count() == 0


def test_readonly_blocks_cancel_and_replay(client, readonly, test_workflows):
    run, _ = start_run("t_poison", {})
    Executor("w-1").execute(queue.claim("w-1"))
    dead_id = client.get("/api/dead-letters/").json()["results"][0]["id"]

    assert client.post(f"/api/runs/{run.id}/cancel/").status_code == 403
    assert client.post(f"/api/dead-letters/{dead_id}/replay/").status_code == 403


def test_readonly_still_serves_reads(client, readonly):
    start_run("t_two_step", {})

    assert client.get("/api/runs/").status_code == 200
    assert client.get("/api/stats/").status_code == 200
    assert client.get("/api/meta/").json()["readonly"] is True
