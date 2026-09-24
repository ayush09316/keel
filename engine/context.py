import logging

from django.db import IntegrityError, transaction

from .models import IdempotencyRecord


class PendingEvent:
    __slots__ = ("topic", "payload", "dedupe_key")

    def __init__(self, topic, payload, dedupe_key):
        self.topic = topic
        self.payload = payload
        self.dedupe_key = dedupe_key


class StepContext:
    def __init__(self, run, step, workflow):
        self.run = run
        self.step = step
        self.workflow = workflow
        self.run_id = str(run.id)
        self.step_name = step.name
        self.attempt = step.attempt
        self.max_attempts = step.max_attempts
        self.input = run.input or {}
        self.outputs = run.context or {}
        self.logger = logging.getLogger(f"keel.{workflow.name}.{step.name}")
        self._events = []
        self._effects_replayed = []
        self._effects_performed = []

    @property
    def attempts_left(self):
        return max(self.max_attempts - self.attempt, 0)

    @property
    def is_last_attempt(self):
        return self.attempts_left == 0

    def output_of(self, step_name, default=None):
        return self.outputs.get(step_name, default)

    def emit(self, topic, payload, dedupe_key=None):
        if dedupe_key is None:
            dedupe_key = f"{self.run_id}:{self.step_name}:{topic}:{len(self._events)}"
        self._events.append(PendingEvent(topic, payload, dedupe_key))

    def idempotency_key(self, suffix=""):
        key = f"{self.run_id}:{self.step_name}"
        return f"{key}:{suffix}" if suffix else key

    def once(self, suffix, fn):
        key = self.idempotency_key(suffix)
        existing = IdempotencyRecord.objects.filter(pk=key).first()
        if existing is not None:
            self._effects_replayed.append(key)
            return existing.result

        result = fn(key)

        try:
            with transaction.atomic():
                IdempotencyRecord.objects.create(key=key, run_id=self.run.id, result=result)
        except IntegrityError:
            self._effects_replayed.append(key)
            return IdempotencyRecord.objects.get(pk=key).result

        self._effects_performed.append(key)
        return result

    def pending_events(self):
        return list(self._events)
