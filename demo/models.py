from django.db import models


class GatewayCall(models.Model):
    """Every physical call the workflow made to the fake payment gateway.

    This table is the measuring instrument for the whole project: the engine
    delivers steps at least once, so this count is expected to exceed the
    number of Charge rows. Charge is what must stay exactly once.
    """

    id = models.BigAutoField(primary_key=True)
    idempotency_key = models.CharField(max_length=255)
    order_id = models.CharField(max_length=64)
    amount_paise = models.BigIntegerField()
    deduped = models.BooleanField(default=False)
    failed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "demo_gateway_call"
        indexes = [models.Index(fields=["order_id"])]


class Charge(models.Model):
    id = models.BigAutoField(primary_key=True)
    idempotency_key = models.CharField(max_length=255, unique=True)
    order_id = models.CharField(max_length=64)
    amount_paise = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "demo_charge"
        indexes = [models.Index(fields=["order_id"])]

    def as_dict(self):
        return {
            "charge_id": self.id,
            "order_id": self.order_id,
            "amount_paise": self.amount_paise,
            "idempotency_key": self.idempotency_key,
        }


class StockReservation(models.Model):
    id = models.BigAutoField(primary_key=True)
    idempotency_key = models.CharField(max_length=255, unique=True)
    order_id = models.CharField(max_length=64)
    sku = models.CharField(max_length=64)
    quantity = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "demo_stock_reservation"


class Invoice(models.Model):
    id = models.BigAutoField(primary_key=True)
    idempotency_key = models.CharField(max_length=255, unique=True)
    order_id = models.CharField(max_length=64)
    number = models.CharField(max_length=32)
    amount_paise = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "demo_invoice"


class Notification(models.Model):
    id = models.BigAutoField(primary_key=True)
    idempotency_key = models.CharField(max_length=255, unique=True)
    order_id = models.CharField(max_length=64)
    channel = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "demo_notification"
