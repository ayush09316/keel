import datetime as dt
import json

import pytest
from django.utils import timezone

from demo.models import Charge
from engine import queue
from engine.executor import Executor
from engine.management.commands import verify
from engine.models import StepRun
from engine.recorder import ChaosRecorder
from engine.service import start_run

pytestmark = pytest.mark.django_db


@pytest.fixture
def recorder(tmp_path):
    rec = ChaosRecorder(tmp_path / "chaos" / "latest.json", {"runs": 1, "workers": 2})
    rec.lane(0, "w-0", 100)
    rec.lane(1, "w-1", 101)
    return rec


def test_a_sample_shows_which_step_each_worker_holds(recorder):
    start_run("t_two_step", {"order_id": "o-1"})
    queue.claim("w-1")

    snapshot = recorder.sample(force=True)

    lanes = {lane["slot"]: lane for lane in snapshot["lanes"]}
    assert lanes[0]["step"] is None
    assert lanes[1]["step"]["step"] == "first"
    assert lanes[1]["step"]["order"] == "o-1"
    assert snapshot["steps"]["running"] == 1
    assert snapshot["counters"]["attempts"] == 1


def test_samples_are_throttled_unless_forced(recorder):
    assert recorder.sample(force=True) is not None
    assert recorder.sample() is None
    assert len(recorder.samples) == 1


def test_a_respawned_lane_keeps_the_dead_workers_step_as_an_orphan(recorder):
    start_run("t_two_step", {})
    queue.claim("w-0")
    recorder.event("sigkill", slot=0, pid=100, worker="w-0")
    recorder.lane(0, "w-0b", 102)

    lane = recorder.sample(force=True)["lanes"][0]

    assert (lane["pid"], lane["worker"], lane["step"]) == (102, "w-0b", None)
    assert [o["step"] for o in lane["orphans"]] == ["first"]
    assert [e["kind"] for e in recorder.events][-2:] == ["sigkill", "respawn"]


def test_reclaims_and_fenced_commits_become_events(recorder, fast_retries):
    start_run("t_effectful", {})
    stale = queue.claim("w-0")
    StepRun.objects.filter(pk=stale.pk).update(
        lease_expires_at=timezone.now() - dt.timedelta(seconds=1)
    )
    queue.reclaim_expired()
    fresh = queue.claim("w-1")
    Executor("w-0").execute(stale)
    Executor("w-1").execute(fresh)

    recorder.sample(force=True)

    kinds = {e["kind"]: e for e in recorder.events}
    assert kinds["reclaim"]["slot"] == 0
    assert kinds["reclaim"]["step"] == "charge"
    assert kinds["fenced"]["worker"] == "w-0"
    assert kinds["fenced"]["effects"] == 1
    assert recorder.samples[-1]["counters"]["fenced"] == 1


def test_events_are_not_reported_twice(recorder, fast_retries):
    start_run("t_effectful", {})
    step = queue.claim("w-0")
    StepRun.objects.filter(pk=step.pk).update(
        lease_expires_at=timezone.now() - dt.timedelta(seconds=1)
    )
    queue.reclaim_expired()

    recorder.sample(force=True)
    recorder.sample(force=True)

    assert [e["kind"] for e in recorder.events].count("reclaim") == 1


def test_the_recording_carries_the_verify_summary(recorder):
    start_run("t_two_step", {})
    Charge.objects.create(idempotency_key="k1", order_id="o-1", amount_paise=100)
    Charge.objects.create(idempotency_key="k2", order_id="o-1", amount_paise=100)
    recorder.sample(force=True)

    failures, _ = verify.Command().collect_failures(
        {"expect_runs": None, "require_published": False}
    )
    path = recorder.write(verify.summarise(), failures, kills=3, freezes=2)

    body = json.loads(path.read_text())
    assert body["version"] == 1
    assert (body["kills"], body["freezes"]) == (3, 2)
    assert body["summary"]["charged_twice"] == 1
    assert body["passed"] is False
    assert body["samples"][0]["counters"]["charged_twice"] == 1
    assert body["config"] == {"runs": 1, "workers": 2}
