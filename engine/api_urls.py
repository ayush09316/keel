from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .api import (
    DeadLetterViewSet,
    OutboxViewSet,
    WorkerViewSet,
    WorkflowRunViewSet,
    chaos_latest_view,
    meta_view,
    stats_view,
    workflows_view,
)

router = DefaultRouter()
router.register("runs", WorkflowRunViewSet, basename="run")
router.register("dead-letters", DeadLetterViewSet, basename="dead-letter")
router.register("workers", WorkerViewSet, basename="worker")
router.register("outbox", OutboxViewSet, basename="outbox")

urlpatterns = [
    path("stats/", stats_view, name="stats"),
    path("workflows/", workflows_view, name="workflows"),
    path("meta/", meta_view, name="meta"),
    path("chaos/latest/", chaos_latest_view, name="chaos-latest"),
    path("", include(router.urls)),
]
