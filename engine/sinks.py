import json
import logging
import os
import urllib.error
import urllib.request
from pathlib import Path

from django.conf import settings
from django.utils.module_loading import import_string

logger = logging.getLogger("keel.sink")


class Sink:
    def publish(self, envelope):
        raise NotImplementedError

    def close(self):
        pass


class LogSink(Sink):
    def publish(self, envelope):
        logger.info("published %s %s", envelope["topic"], envelope["dedupe_key"])


class MemorySink(Sink):
    def __init__(self):
        self.published = []

    def publish(self, envelope):
        self.published.append(envelope)


class FailingSink(Sink):
    def __init__(self, fail_times=1, inner=None):
        self.remaining = fail_times
        self.inner = inner or MemorySink()

    def publish(self, envelope):
        if self.remaining > 0:
            self.remaining -= 1
            raise RuntimeError("sink is down")
        self.inner.publish(envelope)


class FileSink(Sink):
    def __init__(self, path=None):
        self.path = Path(path or settings.KEEL["OUTBOX_SINK_PATH"])
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def publish(self, envelope):
        with open(self.path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(envelope, default=str) + "\n")
            handle.flush()
            os.fsync(handle.fileno())


class HttpSink(Sink):
    def __init__(self, url=None, timeout=5):
        self.url = url or os.environ.get("KEEL_OUTBOX_WEBHOOK", "")
        self.timeout = timeout
        if not self.url:
            raise ValueError("HttpSink needs KEEL_OUTBOX_WEBHOOK")

    def publish(self, envelope):
        body = json.dumps(envelope, default=str).encode()
        request = urllib.request.Request(
            self.url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Idempotency-Key": envelope["dedupe_key"] or str(envelope["id"]),
            },
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            if response.status >= 300:
                raise urllib.error.HTTPError(
                    self.url, response.status, "sink rejected event", response.headers, None
                )


def build_sink(path=None):
    return import_string(path or settings.KEEL["OUTBOX_SINK"])()
