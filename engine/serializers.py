from rest_framework import serializers

from .models import DeadLetter, OutboxEvent, StepAttempt, StepRun, Worker, WorkflowRun


class StepAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = StepAttempt
        fields = [
            "id",
            "attempt",
            "worker_id",
            "outcome",
            "started_at",
            "finished_at",
            "reclaimed_at",
            "fenced_at",
            "effects_performed",
            "effects_replayed",
            "events",
            "error_type",
            "error",
        ]


class StepRunSerializer(serializers.ModelSerializer):
    attempts_left = serializers.IntegerField(read_only=True)
    attempts = StepAttemptSerializer(many=True, read_only=True)
    dead_letter = serializers.SerializerMethodField()

    def get_dead_letter(self, step):
        try:
            dead = step.dead_letter
        except DeadLetter.DoesNotExist:
            return None
        return {"id": dead.id, "replayed_at": dead.replayed_at, "replay_count": dead.replay_count}

    class Meta:
        model = StepRun
        fields = [
            "id",
            "name",
            "seq",
            "state",
            "attempt",
            "max_attempts",
            "attempts_left",
            "reclaimed",
            "effects_performed",
            "effects_replayed",
            "run_after",
            "lease_owner",
            "lease_expires_at",
            "heartbeat_at",
            "output",
            "error_type",
            "error",
            "started_at",
            "finished_at",
            "attempts",
            "dead_letter",
        ]


class OutboxEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutboxEvent
        fields = [
            "id",
            "topic",
            "step_name",
            "dedupe_key",
            "payload",
            "created_at",
            "published_at",
            "publish_attempts",
            "last_error",
        ]


class OutboxListSerializer(OutboxEventSerializer):
    workflow = serializers.CharField(source="run.workflow", read_only=True, default=None)

    class Meta(OutboxEventSerializer.Meta):
        fields = ["run", "workflow"] + OutboxEventSerializer.Meta.fields


class StepSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = StepRun
        fields = ["name", "state", "attempt", "max_attempts"]


class WorkflowRunSerializer(serializers.ModelSerializer):
    duration_seconds = serializers.FloatField(read_only=True)
    steps = StepSummarySerializer(many=True, read_only=True)

    class Meta:
        model = WorkflowRun
        fields = [
            "id",
            "workflow",
            "state",
            "idempotency_key",
            "input",
            "error",
            "created_at",
            "started_at",
            "finished_at",
            "duration_seconds",
            "steps",
        ]


class WorkflowRunDetailSerializer(WorkflowRunSerializer):
    steps = StepRunSerializer(many=True, read_only=True)
    events = OutboxEventSerializer(many=True, read_only=True)

    class Meta(WorkflowRunSerializer.Meta):
        fields = WorkflowRunSerializer.Meta.fields + ["context", "events"]


class StartRunSerializer(serializers.Serializer):
    workflow = serializers.CharField()
    input = serializers.JSONField(required=False, default=dict)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class DeadLetterSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeadLetter
        fields = [
            "id",
            "run",
            "step",
            "workflow",
            "step_name",
            "attempts",
            "error_type",
            "error",
            "created_at",
            "replayed_at",
            "replay_count",
        ]


class WorkerSerializer(serializers.ModelSerializer):
    leases = serializers.SerializerMethodField()
    held = serializers.SerializerMethodField()

    def held_steps(self, worker):
        return self.context.get("held", {}).get(worker.id, [])

    def get_leases(self, worker):
        return len(self.held_steps(worker))

    def get_held(self, worker):
        steps = self.held_steps(worker)
        return steps[0] if steps else None

    class Meta:
        model = Worker
        fields = [
            "id",
            "hostname",
            "pid",
            "started_at",
            "last_seen_at",
            "claimed",
            "succeeded",
            "failed",
            "current_step",
            "leases",
            "held",
        ]
