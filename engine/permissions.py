from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission

READONLY_MESSAGE = (
    "This Keel instance is a read-only demo (KEEL_READONLY=1). "
    "Starting, cancelling and replaying runs are disabled here; run it locally to try them."
)


def readonly():
    return bool(settings.KEEL.get("READONLY"))


class ReadOnlyDemo(BasePermission):
    message = READONLY_MESSAGE

    def has_permission(self, request, view):
        return request.method in SAFE_METHODS or not readonly()
