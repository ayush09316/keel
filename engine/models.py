import uuid

from django.db import models


class RunState(models.TextChoices):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StepState(models.TextChoices):
    BLOCKED = "blocked"
    READY = "ready"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    DEAD = "dead"
    CANCELLED = "cancelled"


TERMINAL_RUN_STATES = {RunState.COMPLETED, RunState.FAILED, RunState.CANCELLED}


class WorkflowRun(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.CharField(max_length=128)
    idempotency_key = models.CharField(max_length=200, unique=True, null=True, blank=True)
    state = models.CharField(max_length=16, choices=RunState.choices, default=RunState.PENDING)
    input = models.JSONField(default=dict)
    context = models.JSONField(default=dict)
    error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "keel_workflow_run"
        indexes = [
            models.Index(fields=["state", "-created_at"]),
            models.Index(fields=["workflow", "-created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.workflow}/{self.id}"

    @property
    def is_terminal(self):
        return self.state in TERMINAL_RUN_STATES

    @property
    def duration_seconds(self):
        if not self.started_at:
            return None
        end = self.finished_at
        if end is None:
            return None
        return (end - self.started_at).total_seconds()


class StepRun(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(WorkflowRun, on_delete=models.CASCADE, related_name="steps")
    name = models.CharField(max_length=128)
    seq = models.IntegerField()
    state = models.CharField(max_length=16, choices=StepState.choices, default=StepState.BLOCKED)

    attempt = models.IntegerField(default=0)
    max_attempts = models.IntegerField(default=3)
    reclaimed = models.IntegerField(default=0)
    effects_performed = models.IntegerField(default=0)
    effects_replayed = models.IntegerField(default=0)

    run_after = models.DateTimeField()
    lease_owner = models.CharField(max_length=128, null=True, blank=True)
    lease_expires_at = models.DateTimeField(null=True, blank=True)
    heartbeat_at = models.DateTimeField(null=True, blank=True)

    output = models.JSONField(null=True, blank=True)
    error = models.TextField(blank=True, default="")
    error_type = models.CharField(max_length=128, blank=True, default="")

    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "keel_step_run"
        constraints = [
            models.UniqueConstraint(fields=["run", "name"], name="keel_step_unique_per_run"),
        ]
        indexes = [
            models.Index(fields=["state", "run_after"], name="keel_step_claim_idx"),
            models.Index(fields=["state", "lease_expires_at"], name="keel_step_lease_idx"),
            models.Index(fields=["run", "seq"], name="keel_step_run_seq_idx"),
        ]
        ordering = ["seq"]

    def __str__(self):
        return f"{self.run_id}/{self.name}"

    @property
    def attempts_left(self):
        return max(self.max_attempts - self.attempt, 0)


class OutboxEvent(models.Model):
    id = models.BigAutoField(primary_key=True)
    run = models.ForeignKey(
        WorkflowRun, on_delete=models.CASCADE, related_name="events", null=True, blank=True
    )
    step_name = models.CharField(max_length=128, blank=True, default="")
    topic = models.CharField(max_length=128)
    payload = models.JSONField(default=dict)
    dedupe_key = models.CharField(max_length=200, unique=True, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)
    publish_attempts = models.IntegerField(default=0)
    publish_after = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")

    lease_owner = models.CharField(max_length=128, null=True, blank=True)
    lease_expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "keel_outbox_event"
        indexes = [
            models.Index(
                fields=["publish_after"],
                name="keel_outbox_pending_idx",
                condition=models.Q(published_at__isnull=True),
            ),
            models.Index(fields=["run", "id"], name="keel_outbox_run_idx"),
        ]
        ordering = ["id"]

    def __str__(self):
        return f"{self.topic}#{self.id}"


class IdempotencyRecord(models.Model):
    key = models.CharField(max_length=255, primary_key=True)
    run = models.ForeignKey(
        WorkflowRun, on_delete=models.CASCADE, related_name="idempotency", null=True, blank=True
    )
    result = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "keel_idempotency_record"

    def __str__(self):
        return self.key


class DeadLetter(models.Model):
    id = models.BigAutoField(primary_key=True)
    run = models.ForeignKey(WorkflowRun, on_delete=models.CASCADE, related_name="dead_letters")
    step = models.OneToOneField(StepRun, on_delete=models.CASCADE, related_name="dead_letter")
    workflow = models.CharField(max_length=128)
    step_name = models.CharField(max_length=128)
    attempts = models.IntegerField()
    error = models.TextField(blank=True, default="")
    error_type = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    replayed_at = models.DateTimeField(null=True, blank=True)
    replay_count = models.IntegerField(default=0)

    class Meta:
        db_table = "keel_dead_letter"
        indexes = [models.Index(fields=["replayed_at", "-created_at"], name="keel_dlq_idx")]
        ordering = ["-created_at"]

    def __str__(self):
        return f"dlq:{self.workflow}/{self.step_name}"


class Worker(models.Model):
    id = models.CharField(max_length=128, primary_key=True)
    hostname = models.CharField(max_length=200, blank=True, default="")
    pid = models.IntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    claimed = models.IntegerField(default=0)
    succeeded = models.IntegerField(default=0)
    failed = models.IntegerField(default=0)
    current_step = models.CharField(max_length=128, blank=True, default="")

    class Meta:
        db_table = "keel_worker"
        ordering = ["-last_seen_at"]

    def __str__(self):
        return self.id


class AttemptOutcome(models.TextChoices):
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    RETRY = "retry"
    DEAD = "dead"
    LEASE_EXPIRED = "lease_expired"
    FENCED = "fenced"


class StepAttempt(models.Model):
    id = models.BigAutoField(primary_key=True)
    run = models.ForeignKey(WorkflowRun, on_delete=models.CASCADE, related_name="attempts")
    step = models.ForeignKey(StepRun, on_delete=models.CASCADE, related_name="attempts")
    attempt = models.IntegerField()
    worker_id = models.CharField(max_length=128)
    outcome = models.CharField(
        max_length=16, choices=AttemptOutcome.choices, default=AttemptOutcome.RUNNING
    )
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)
    reclaimed_at = models.DateTimeField(null=True, blank=True)
    fenced_at = models.DateTimeField(null=True, blank=True)
    effects_performed = models.IntegerField(default=0)
    effects_replayed = models.IntegerField(default=0)
    events = models.IntegerField(default=0)
    error_type = models.CharField(max_length=128, blank=True, default="")
    error = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        db_table = "keel_step_attempt"
        indexes = [
            models.Index(fields=["step", "attempt"], name="keel_attempt_step_idx"),
            models.Index(fields=["worker_id", "finished_at"], name="keel_attempt_worker_idx"),
        ]
        ordering = ["id"]

    def __str__(self):
        return f"{self.step_id}#{self.attempt}"
