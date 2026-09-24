import signal
import time
import uuid

from django.core.management.base import BaseCommand

from engine.outbox import relay_once, release_expired_leases
from engine.sinks import build_sink


class Command(BaseCommand):
    help = "Publish outbox events to the configured sink. At-least-once, ordered by insertion."

    def add_arguments(self, parser):
        parser.add_argument("--sink", default=None)
        parser.add_argument("--batch", type=int, default=None)
        parser.add_argument("--interval", type=float, default=0.5)
        parser.add_argument("--max-seconds", type=float, default=None)
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        sink = build_sink(options["sink"])
        relay_id = f"relay-{uuid.uuid4().hex[:8]}"
        stopping = {"flag": False}

        def stop(_signum, _frame):
            stopping["flag"] = True

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)

        started = time.monotonic()
        totals = [0, 0]

        while not stopping["flag"]:
            release_expired_leases()
            published, failed = relay_once(sink, relay_id, batch_size=options["batch"])
            totals[0] += published
            totals[1] += failed
            if options["once"]:
                break
            if options["max_seconds"] and time.monotonic() - started >= options["max_seconds"]:
                break
            if published == 0:
                time.sleep(options["interval"])

        sink.close()
        self.stdout.write(
            self.style.SUCCESS(f"relay published={totals[0]} failed={totals[1]}")
        )
