from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .api import DeadLetterViewSet, WorkerViewSet, WorkflowRunViewSet, stats_view, workflows_view

router = DefaultRouter()
router.register("runs", WorkflowRunViewSet, basename="run")
router.register("dead-letters", DeadLetterViewSet, basename="dead-letter")
router.register("workers", WorkerViewSet, basename="worker")

urlpatterns = [
    path("stats/", stats_view, name="stats"),
    path("workflows/", workflows_view, name="workflows"),
    path("", include(router.urls)),
]
