import pytest
from django.utils import timezone

from engine import queue
from engine.executor import Executor
from engine.models import OutboxEvent
from engine.outbox import relay_once
from engine.service import start_run
from engine.sinks import FailingSink, MemorySink

pytestmark = pytest.mark.django_db


def drive(steps=2, worker="worker-a"):
    for _ in range(steps):
        step = queue.claim(worker)
        if step is None:
            return
        Executor(worker).execute(step)


def test_events_are_written_with_the_step_not_before_it():
    start_run("t_two_step", {"value": 1})
    assert OutboxEvent.objects.count() == 0

    drive(1)
    assert OutboxEvent.objects.count() == 1


def test_the_relay_publishes_and_marks_each_event_once():
    start_run("t_two_step", {"value": 1})
    drive()
    sink = MemorySink()

    published, failed = relay_once(sink, "relay-1")
    assert (published, failed) == (2, 0)
    assert [e["topic"] for e in sink.published] == ["t.first.done", "t.second.done"]

    assert relay_once(sink, "relay-1") == (0, 0)
    assert len(sink.published) == 2
    assert OutboxEvent.objects.filter(published_at__isnull=True).count() == 0


def test_a_failing_sink_leaves_the_event_pending_and_backs_off():
    start_run("t_two_step", {"value": 1})
    drive(1)
    sink = FailingSink(fail_times=5)

    published, failed = relay_once(sink, "relay-1")
    assert (published, failed) == (0, 1)

    event = OutboxEvent.objects.get()
    assert event.published_at is None
    assert event.publish_attempts == 1
    assert event.publish_after > timezone.now()
    assert "sink is down" in event.last_error


def test_the_event_goes_out_once_the_sink_comes_back():
    start_run("t_two_step", {"value": 1})
    drive(1)

    failing = FailingSink(fail_times=1)
    assert relay_once(failing, "relay-1") == (0, 1)

    OutboxEvent.objects.update(publish_after=timezone.now())
    good = MemorySink()
    assert relay_once(good, "relay-1") == (1, 0)
    assert len(good.published) == 1


def test_the_envelope_carries_what_a_consumer_needs_to_dedupe():
    run, _ = start_run("t_two_step", {"value": 1})
    drive(1)
    sink = MemorySink()
    relay_once(sink, "relay-1")

    envelope = sink.published[0]
    assert envelope["run_id"] == str(run.id)
    assert envelope["step"] == "first"
    assert envelope["dedupe_key"]
    assert envelope["payload"] == {"run": str(run.id)}


def test_two_relays_do_not_publish_the_same_event_twice():
    start_run("t_two_step", {"value": 1})
    drive()

    first, second = MemorySink(), MemorySink()
    relay_once(first, "relay-1")
    relay_once(second, "relay-2")

    assert len(first.published) == 2
    assert len(second.published) == 0
