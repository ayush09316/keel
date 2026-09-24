from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"service": "keel", "status": "ok"})


urlpatterns = [
    path("", health),
    path("api/", include("engine.api_urls")),
]
