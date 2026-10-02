import datetime as dt
import json
from pathlib import Path

from django.conf import settings
from django.db.models import CharField, Q
from django.db.models.functions import Cast
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from . import service
from .errors import WorkflowNotRegistered
from .models import DeadLetter, OutboxEvent, StepAttempt, StepRun, StepState, Worker, WorkflowRun
from .permissions import READONLY_MESSAGE, readonly
from .registry import registry
from .serializers import (
    DeadLetterSerializer,
    OutboxListSerializer,
    StartRunSerializer,
    WorkerSerializer,
    WorkflowRunDetailSerializer,
    WorkflowRunSerializer,
)

THROUGHPUT_BUCKET_SECONDS = 10
THROUGHPUT_BUCKETS = 30


class WorkflowRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WorkflowRun.objects.all()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return WorkflowRunDetailSerializer
        return WorkflowRunSerializer

    def get_queryset(self):
        qs = WorkflowRun.objects.prefetch_related("steps")
        if self.action == "retrieve":
            qs = qs.prefetch_related("events", "steps__attempts", "steps__dead_letter")
        state = self.request.query_params.get("state")
        workflow = self.request.query_params.get("workflow")
        query = (self.request.query_params.get("q") or "").strip().lower()
        if state:
            qs = qs.filter(state=state)
        if workflow:
            qs = qs.filter(workflow=workflow)
        if query:
            qs = qs.annotate(id_text=Cast("id", CharField())).filter(
                Q(id_text__startswith=query) | Q(input__order_id__icontains=query)
            )
        return qs

    def create(self, request):
        payload = StartRunSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        try:
            run, created = service.start_run(
                data["workflow"],
                data.get("input") or {},
                idempotency_key=data.get("idempotency_key") or None,
            )
        except WorkflowNotRegistered as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        body = WorkflowRunDetailSerializer(run).data
        body["created"] = created
        return Response(body, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        run, changed = service.cancel_run(pk)
        return Response({"run": WorkflowRunSerializer(run).data, "changed": changed})


class DeadLetterViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DeadLetterSerializer
    queryset = DeadLetter.objects.all()

    def get_queryset(self):
        qs = DeadLetter.objects.all()
        if self.request.query_params.get("open") == "1":
            qs = qs.filter(replayed_at__isnull=True)
        return qs

    @action(detail=True, methods=["post"])
    def replay(self, request, pk=None):
        dead = service.replay_dead_letter(pk)
        return Response(DeadLetterSerializer(dead).data)


class WorkerViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkerSerializer
    queryset = Worker.objects.all()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        held = {}
        for row in StepRun.objects.filter(state=StepState.RUNNING).values(
            "lease_owner", "name", "run_id", "attempt", "lease_expires_at", "heartbeat_at"
        ):
            held.setdefault(row["lease_owner"], []).append(
                {
                    "run": str(row["run_id"]),
                    "step": row["name"],
                    "attempt": row["attempt"],
                    "lease_expires_at": row["lease_expires_at"],
                    "heartbeat_at": row["heartbeat_at"],
                }
            )
        context["held"] = held
        return context

    @action(detail=False, methods=["get"])
    def throughput(self, request):
        now = timezone.now()
        window = THROUGHPUT_BUCKET_SECONDS * THROUGHPUT_BUCKETS
        since = now - dt.timedelta(seconds=window)
        total = [0] * THROUGHPUT_BUCKETS
        per_worker = {}
        for worker_id, finished_at in StepAttempt.objects.filter(
            finished_at__gt=since, finished_at__lte=now
        ).values_list("worker_id", "finished_at"):
            age = (now - finished_at).total_seconds()
            index = THROUGHPUT_BUCKETS - 1 - min(int(age // THROUGHPUT_BUCKET_SECONDS), THROUGHPUT_BUCKETS - 1)
            total[index] += 1
            per_worker.setdefault(worker_id, [0] * THROUGHPUT_BUCKETS)[index] += 1
        return Response(
            {
                "bucket_seconds": THROUGHPUT_BUCKET_SECONDS,
                "until": now,
                "total": total,
                "workers": per_worker,
            }
        )


class OutboxViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OutboxListSerializer
    queryset = OutboxEvent.objects.all()

    def get_queryset(self):
        qs = OutboxEvent.objects.select_related("run").order_by("-id")
        state = self.request.query_params.get("state")
        topic = self.request.query_params.get("topic")
        if state == "pending":
            qs = qs.filter(published_at__isnull=True)
        elif state == "published":
            qs = qs.filter(published_at__isnull=False)
        if topic:
            qs = qs.filter(topic=topic)
        return qs


def load_recording(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return None


@api_view(["GET"])
def chaos_latest_view(request):
    conf = settings.KEEL
    for source, path in (("latest", conf["CHAOS_RECORDING_PATH"]), ("sample", conf["CHAOS_SAMPLE_PATH"])):
        recording = load_recording(path)
        if recording is not None:
            recording["source"] = source
            return Response(recording)
    return Response(
        {"detail": "No chaos recording yet. Run `make chaos` to record one."},
        status=status.HTTP_404_NOT_FOUND,
    )


@api_view(["GET"])
def meta_view(request):
    return Response(
        {
            "readonly": readonly(),
            "readonly_message": READONLY_MESSAGE if readonly() else "",
            "workflows": registry.names(),
        }
    )


@api_view(["GET"])
def stats_view(request):
    return Response(service.stats())


@api_view(["GET"])
def workflows_view(request):
    return Response(
        [
            {
                "name": flow.name,
                "description": flow.description,
                "steps": [
                    {
                        "name": s.name,
                        "max_attempts": s.max_attempts,
                        "description": s.description,
                    }
                    for s in flow.steps
                ],
            }
            for flow in registry.all()
        ]
    )
