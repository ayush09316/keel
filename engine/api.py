from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from . import service
from .errors import WorkflowNotRegistered
from .models import DeadLetter, Worker, WorkflowRun
from .registry import registry
from .serializers import (
    DeadLetterSerializer,
    StartRunSerializer,
    WorkerSerializer,
    WorkflowRunDetailSerializer,
    WorkflowRunSerializer,
)


class WorkflowRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WorkflowRun.objects.all()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return WorkflowRunDetailSerializer
        return WorkflowRunSerializer

    def get_queryset(self):
        qs = WorkflowRun.objects.prefetch_related("steps")
        if self.action == "retrieve":
            qs = qs.prefetch_related("events")
        state = self.request.query_params.get("state")
        workflow = self.request.query_params.get("workflow")
        if state:
            qs = qs.filter(state=state)
        if workflow:
            qs = qs.filter(workflow=workflow)
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
