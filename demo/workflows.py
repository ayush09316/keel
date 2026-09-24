from engine.registry import Step, Workflow, workflow

from .services import billing, gateway, inventory, notifications, refund_policy


@workflow(
    "order_fulfilment",
    description="Reserve stock, capture payment, issue the invoice, tell the customer.",
)
class OrderFulfilment(Workflow):
    steps = [
        Step("reserve_stock", max_attempts=5, description="Hold inventory for the order"),
        Step("charge_payment", max_attempts=5, description="Capture money, exactly once"),
        Step("issue_invoice", max_attempts=5, description="Create the tax invoice"),
        Step("notify_customer", max_attempts=5, description="Send the confirmation"),
    ]

    def reserve_stock(self, ctx):
        order_id = ctx.input["order_id"]
        result = ctx.once(
            "reserve",
            lambda key: inventory.reserve(
                key, order_id, ctx.input.get("sku", "TILE-001"), ctx.input.get("quantity", 1)
            ),
        )
        ctx.emit("stock.reserved", {"order_id": order_id, **result})
        return result

    def charge_payment(self, ctx):
        order_id = ctx.input["order_id"]
        amount = ctx.input["amount_paise"]
        result = ctx.once("charge", lambda key: gateway.charge(key, order_id, amount))
        ctx.emit(
            "payment.captured",
            {"order_id": order_id, "amount_paise": amount, "charge_id": result["charge_id"]},
            dedupe_key=f"payment.captured:{order_id}",
        )
        return result

    def issue_invoice(self, ctx):
        order_id = ctx.input["order_id"]
        amount = ctx.input["amount_paise"]
        result = ctx.once("invoice", lambda key: billing.issue_invoice(key, order_id, amount))
        ctx.emit(
            "invoice.issued",
            {"order_id": order_id, **result},
            dedupe_key=f"invoice.issued:{order_id}",
        )
        return result

    def notify_customer(self, ctx):
        order_id = ctx.input["order_id"]
        invoice = ctx.output_of("issue_invoice", {})
        result = ctx.once(
            "notify",
            lambda key: notifications.send(key, order_id, ctx.input.get("channel", "whatsapp")),
        )
        ctx.emit(
            "order.confirmed",
            {"order_id": order_id, "invoice": invoice.get("number"), **result},
            dedupe_key=f"order.confirmed:{order_id}",
        )
        return result


@workflow(
    "refund_request",
    description="Validate a refund against the captured charge, then pay it back.",
)
class RefundRequest(Workflow):
    steps = [
        Step("validate", max_attempts=3, description="Permanent failures go straight to the DLQ"),
        Step("reverse_charge", max_attempts=5),
        Step("notify_customer", max_attempts=5),
    ]

    def validate(self, ctx):
        return refund_policy.validate(ctx.input)

    def reverse_charge(self, ctx):
        order_id = ctx.input["order_id"]
        amount = ctx.input["amount_paise"]
        result = ctx.once(
            "reverse", lambda key: gateway.charge(key, f"refund-{order_id}", -amount)
        )
        ctx.emit("refund.settled", {"order_id": order_id, "amount_paise": amount})
        return result

    def notify_customer(self, ctx):
        order_id = ctx.input["order_id"]
        return ctx.once("notify", lambda key: notifications.send(key, order_id, "email"))
