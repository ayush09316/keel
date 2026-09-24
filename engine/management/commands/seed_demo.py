import random
import uuid

from django.core.management.base import BaseCommand

from engine.registry import autodiscover
from engine.service import start_run


class Command(BaseCommand):
    help = "Queue N demo order_fulfilment runs."

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=20)
        parser.add_argument("--workflow", default="order_fulfilment")
        parser.add_argument("--prefix", default=None)

    def handle(self, *args, **options):
        autodiscover()
        prefix = options["prefix"] or uuid.uuid4().hex[:6]
        created = 0

        for index in range(options["count"]):
            order_id = f"{prefix}-{index:04d}"
            _, was_created = start_run(
                options["workflow"],
                {
                    "order_id": order_id,
                    "sku": random.choice(["TILE-001", "LAM-204", "PLY-19MM"]),
                    "quantity": random.randint(1, 40),
                    "amount_paise": random.randint(50_000, 900_000),
                    "channel": "whatsapp",
                },
                idempotency_key=f"order:{order_id}",
            )
            created += int(was_created)

        self.stdout.write(
            self.style.SUCCESS(f"queued {created} runs (prefix {prefix}, {options['count']} requested)")
        )
