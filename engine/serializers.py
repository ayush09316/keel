from rest_framework import serializers

from .models import DeadLetter, OutboxEvent, StepRun, Worker, WorkflowRun


class StepRunSerializer(serializers.ModelSerializer):
    attempts_left = serializers.IntegerField(read_only=True)

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
        ]
