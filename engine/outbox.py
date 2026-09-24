import datetime as dt
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import OutboxEvent
from .retry import backoff_seconds

logger = logging.getLogger("keel.outbox")

MAX_PUBLISH_ATTEMPTS = 12


def envelope_for(event):
    return {
        "id": event.id,
        "topic": event.topic,
        "dedupe_key": event.dedupe_key,
        "run_id": str(event.run_id) if event.run_id else None,
        "step": event.step_name,
        "payload": event.payload,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def claim_batch(relay_id, batch_size=None, lease_seconds=30, now=None):
    now = now or timezone.now()
    batch_size = batch_size or settings.KEEL["OUTBOX_BATCH"]

    with transaction.atomic():
        ids = list(
            OutboxEvent.objects.select_for_update(skip_locked=True)
            .filter(published_at__isnull=True)
            .filter(publish_after__isnull=True)
            .order_by("id")
            .values_list("id", flat=True)[:batch_size]
        )
        due = list(
            OutboxEvent.objects.select_for_update(skip_locked=True)
            .filter(published_at__isnull=True, publish_after__lte=now)
            .order_by("id")
            .values_list("id", flat=True)[: max(batch_size - len(ids), 0)]
        )
        ids.extend(due)
        if not ids:
            return []

        OutboxEvent.objects.filter(id__in=ids).update(
            lease_owner=relay_id, lease_expires_at=now + dt.timedelta(seconds=lease_seconds)
        )
        return list(OutboxEvent.objects.filter(id__in=ids).order_by("id"))


def publish_batch(sink, events, now=None):
    now = now or timezone.now()
    published, failed = 0, 0

    for event in events:
        try:
            sink.publish(envelope_for(event))
        except Exception as exc:  # noqa: BLE001 - a sink failure must not kill the relay
            failed += 1
            attempts = event.publish_attempts + 1
            delay = backoff_seconds(attempts, base=1.0, maximum=120)
            OutboxEvent.objects.filter(pk=event.pk).update(
                publish_attempts=attempts,
                publish_after=now + dt.timedelta(seconds=delay),
                last_error=f"{type(exc).__name__}: {exc}"[:2000],
                lease_owner=None,
                lease_expires_at=None,
            )
            logger.warning(
                "publish failed id=%s topic=%s attempt=%d retry_in=%.1fs: %s",
                event.id,
                event.topic,
                attempts,
                delay,
                exc,
            )
            continue

        OutboxEvent.objects.filter(pk=event.pk, published_at__isnull=True).update(
            published_at=now,
            publish_attempts=event.publish_attempts + 1,
            lease_owner=None,
            lease_expires_at=None,
            last_error="",
        )
        published += 1

    return published, failed


def relay_once(sink, relay_id="relay", batch_size=None, now=None):
    events = claim_batch(relay_id, batch_size=batch_size, now=now)
    if not events:
        return 0, 0
    return publish_batch(sink, events, now=now)


def release_expired_leases(now=None):
    now = now or timezone.now()
    return OutboxEvent.objects.filter(
        published_at__isnull=True, lease_expires_at__lt=now
    ).update(lease_owner=None, lease_expires_at=None)
