import os
import random
import time

from engine.errors import NonRetryableError

from .models import Charge, GatewayCall, Invoice, Notification, StockReservation


def failure_rate(name):
    specific = os.environ.get(f"KEEL_DEMO_FAIL_{name.upper()}")
    if specific is not None:
        return float(specific)
    return float(os.environ.get("KEEL_DEMO_FAILURE_RATE", "0.25"))


def latency_ms():
    return int(os.environ.get("KEEL_DEMO_LATENCY_MS", "60"))


def flake(name, rng=random):
    time.sleep(latency_ms() / 1000.0)
    if rng.random() < failure_rate(name):
        raise TransientUpstreamError(f"{name} upstream returned 503")


class TransientUpstreamError(RuntimeError):
    pass


class InventoryService:
    def reserve(self, key, order_id, sku, quantity):
        flake("inventory")
        reservation, _ = StockReservation.objects.get_or_create(
            idempotency_key=key,
            defaults={"order_id": order_id, "sku": sku, "quantity": quantity},
        )
        return {"reservation_id": reservation.id, "sku": sku, "quantity": quantity}


class PaymentGateway:
    """A payment gateway that dedupes on an idempotency key, the way real ones do.

    The key is derived from the run and the step, so every retry and every
    reclaimed lease presents the same key and the customer is charged once.
    """

    def charge(self, key, order_id, amount_paise):
        existing = Charge.objects.filter(idempotency_key=key).first()
        if existing is not None:
            GatewayCall.objects.create(
                idempotency_key=key,
                order_id=order_id,
                amount_paise=amount_paise,
                deduped=True,
            )
            return existing.as_dict()

        try:
            flake("payment")
        except TransientUpstreamError:
            GatewayCall.objects.create(
                idempotency_key=key,
                order_id=order_id,
                amount_paise=amount_paise,
                failed=True,
            )
            raise

        GatewayCall.objects.create(
            idempotency_key=key, order_id=order_id, amount_paise=amount_paise
        )
        charge = Charge.objects.create(
            idempotency_key=key, order_id=order_id, amount_paise=amount_paise
        )
        return charge.as_dict()


class BillingService:
    def issue_invoice(self, key, order_id, amount_paise):
        flake("billing")
        invoice, _ = Invoice.objects.get_or_create(
            idempotency_key=key,
            defaults={
                "order_id": order_id,
                "number": f"INV-{order_id}",
                "amount_paise": amount_paise,
            },
        )
        return {"invoice_id": invoice.id, "number": invoice.number}


class NotificationService:
    def send(self, key, order_id, channel):
        flake("notify")
        note, _ = Notification.objects.get_or_create(
            idempotency_key=key, defaults={"order_id": order_id, "channel": channel}
        )
        return {"notification_id": note.id, "channel": channel}


class RefundPolicy:
    def validate(self, payload):
        order_id = payload.get("order_id")
        if not order_id:
            raise NonRetryableError("refund request has no order_id")
        amount = payload.get("amount_paise", 0)
        if amount <= 0:
            raise NonRetryableError(f"refund amount {amount} is not positive")
        charge = Charge.objects.filter(order_id=order_id).first()
        if charge is None:
            raise NonRetryableError(f"no charge exists for order {order_id}")
        if amount > charge.amount_paise:
            raise NonRetryableError(
                f"refund {amount} exceeds captured {charge.amount_paise}"
            )
        return {"charge_id": charge.id, "captured": charge.amount_paise}


inventory = InventoryService()
gateway = PaymentGateway()
billing = BillingService()
notifications = NotificationService()
refund_policy = RefundPolicy()
