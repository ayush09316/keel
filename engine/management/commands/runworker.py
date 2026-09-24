from django.core.management.base import BaseCommand

from engine.worker import WorkerLoop


class Command(BaseCommand):
    help = "Run a Keel worker: claim steps, execute them, renew the lease, commit atomically."

    def add_arguments(self, parser):
        parser.add_argument("--id", dest="worker_id", default=None)
        parser.add_argument("--lease", dest="lease", type=int, default=None)
        parser.add_argument("--max-steps", dest="max_steps", type=int, default=None)
        parser.add_argument("--max-seconds", dest="max_seconds", type=float, default=None)
        parser.add_argument("--exit-when-idle", action="store_true")
        parser.add_argument("--no-reaper", action="store_true")

    def handle(self, *args, **options):
        loop = WorkerLoop(
            worker_id=options["worker_id"],
            lease_seconds=options["lease"],
            reaper=not options["no_reaper"],
        )
        loop.install_signal_handlers()
        counters = loop.run(
            max_steps=options["max_steps"],
            max_seconds=options["max_seconds"],
            exit_when_idle=options["exit_when_idle"],
        )
        self.stdout.write(self.style.SUCCESS(f"worker finished {counters}"))
