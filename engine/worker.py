import logging
import os
import signal
import socket
import threading
import time
import uuid

from django.conf import settings
from django.db import connection
from django.utils import timezone

from . import queue as stepqueue
from .executor import DEAD, LEASE_LOST, RETRY, SUCCEEDED, Executor
from .models import Worker
from .registry import autodiscover

logger = logging.getLogger("keel.worker")


class Heartbeat(threading.Thread):
    """Renews the lease of the in-flight step from a second connection.

    Without this the lease would have to be longer than the slowest possible
    step, which is the same as having no crash detection at all.
    """

    daemon = True

    def __init__(self, step_id, worker_id, attempt, interval, lease_seconds):
        super().__init__(name=f"keel-heartbeat-{worker_id}")
        self.step_id = step_id
        self.worker_id = worker_id
        self.attempt = attempt
        self.interval = interval
        self.lease_seconds = lease_seconds
        self.stopped = threading.Event()
        self.lost = threading.Event()

    def run(self):
        try:
            while not self.stopped.wait(self.interval):
                rows = stepqueue.heartbeat(
                    self.step_id, self.worker_id, self.attempt, self.lease_seconds
                )
                if rows == 0:
                    self.lost.set()
                    return
        finally:
            connection.close()

    def stop(self):
        self.stopped.set()


class WorkerLoop:
    def __init__(self, worker_id=None, lease_seconds=None, reaper=True, verbose=True):
        conf = settings.KEEL
        self.worker_id = worker_id or f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"
        self.lease_seconds = lease_seconds or conf["LEASE_SECONDS"]
        self.heartbeat_interval = min(conf["HEARTBEAT_SECONDS"], max(self.lease_seconds / 3, 1))
        self.poll_interval = conf["POLL_INTERVAL_SECONDS"]
        self.poll_idle_max = conf["POLL_IDLE_MAX_SECONDS"]
        self.reaper_enabled = reaper
        self.verbose = verbose
        self.executor = Executor(self.worker_id)
        self.stopping = threading.Event()
        self.counters = {"claimed": 0, "succeeded": 0, "retried": 0, "dead": 0, "lease_lost": 0}
        self._last_reap = 0.0

    def install_signal_handlers(self):
        def handle(signum, _frame):
            logger.info("signal %s received, finishing current step", signum)
            self.stopping.set()

        signal.signal(signal.SIGTERM, handle)
        signal.signal(signal.SIGINT, handle)

    def register(self):
        Worker.objects.update_or_create(
            id=self.worker_id,
            defaults={"hostname": socket.gethostname(), "pid": os.getpid(), "current_step": ""},
        )

    def touch(self, current_step=""):
        Worker.objects.filter(id=self.worker_id).update(
            last_seen_at=timezone.now(),
            current_step=current_step,
            claimed=self.counters["claimed"],
            succeeded=self.counters["succeeded"],
            failed=self.counters["retried"] + self.counters["dead"],
        )

    def maybe_reap(self):
        if not self.reaper_enabled:
            return
        if time.monotonic() - self._last_reap < max(self.lease_seconds / 3, 2):
            return
        self._last_reap = time.monotonic()
        reclaimed, buried = stepqueue.reclaim_expired()
        if reclaimed or buried:
            logger.info("reaper reclaimed=%d buried=%d", reclaimed, buried)

    def run_one(self):
        step = stepqueue.claim(self.worker_id, self.lease_seconds)
        if step is None:
            return None

        self.counters["claimed"] += 1
        self.touch(current_step=step.name)

        beat = Heartbeat(
            step.pk, self.worker_id, step.attempt, self.heartbeat_interval, self.lease_seconds
        )
        beat.start()
        try:
            outcome = self.executor.execute(step)
        finally:
            beat.stop()
            beat.join(timeout=2)

        if outcome.status == SUCCEEDED:
            self.counters["succeeded"] += 1
        elif outcome.status == RETRY:
            self.counters["retried"] += 1
        elif outcome.status == DEAD:
            self.counters["dead"] += 1
        elif outcome.status == LEASE_LOST:
            self.counters["lease_lost"] += 1

        self.touch()
        return outcome

    def run(self, max_steps=None, max_seconds=None, exit_when_idle=False):
        autodiscover()
        self.register()
        started = time.monotonic()
        idle_for = self.poll_interval
        processed = 0

        logger.info(
            "worker %s online lease=%ss heartbeat=%.1fs",
            self.worker_id,
            self.lease_seconds,
            self.heartbeat_interval,
        )

        while not self.stopping.is_set():
            if max_steps is not None and processed >= max_steps:
                break
            if max_seconds is not None and time.monotonic() - started >= max_seconds:
                break

            self.maybe_reap()
            outcome = self.run_one()

            if outcome is None:
                if exit_when_idle:
                    break
                self.touch()
                time.sleep(idle_for)
                idle_for = min(idle_for * 1.5, self.poll_idle_max)
                continue

            idle_for = self.poll_interval
            processed += 1

        logger.info("worker %s stopping %s", self.worker_id, self.counters)
        Worker.objects.filter(id=self.worker_id).update(current_step="")
        return self.counters
