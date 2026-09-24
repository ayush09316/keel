import signal
import time

from django.core.management.base import BaseCommand

from engine.queue import reclaim_expired


class Command(BaseCommand):
    help = "Return steps whose lease expired to the queue. Workers also do this; this is the standalone form."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=float, default=5.0)
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--max-seconds", type=float, default=None)

    def handle(self, *args, **options):
        stopping = {"flag": False}

        def stop(_signum, _frame):
            stopping["flag"] = True

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)

        started = time.monotonic()
        total_reclaimed = total_buried = 0

        while not stopping["flag"]:
            reclaimed, buried = reclaim_expired()
            total_reclaimed += reclaimed
            total_buried += buried
            if reclaimed or buried:
                self.stdout.write(f"reclaimed={reclaimed} buried={buried}")
            if options["once"]:
                break
            if options["max_seconds"] and time.monotonic() - started >= options["max_seconds"]:
                break
            time.sleep(options["interval"])

        self.stdout.write(
            self.style.SUCCESS(f"reaper reclaimed={total_reclaimed} buried={total_buried}")
        )
