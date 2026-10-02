from django.core.management.base import BaseCommand
from django.db.models import Count, Sum

from demo.models import Charge, GatewayCall
from engine.models import OutboxEvent, RunState, StepRun, StepState, WorkflowRun


def total(field):
    return StepRun.objects.aggregate(n=Sum(field))["n"] or 0


def summarise():
    duplicate_orders = (
        Charge.objects.values("order_id").annotate(n=Count("id")).filter(n__gt=1).count()
    )
    return {
        "steps": StepRun.objects.count(),
        "attempts": total("attempt"),
        "ran_twice": StepRun.objects.filter(attempt__gt=1).count(),
        "reclaimed_steps": StepRun.objects.filter(reclaimed__gt=0).count(),
        "reclaims": total("reclaimed"),
        "effects_performed": total("effects_performed"),
        "effects_replayed": total("effects_replayed"),
        "gateway_calls": GatewayCall.objects.count(),
        "charges": Charge.objects.count(),
        "charged_twice": duplicate_orders,
        "runs_completed": WorkflowRun.objects.filter(state=RunState.COMPLETED).count(),
        "runs_failed": WorkflowRun.objects.filter(state=RunState.FAILED).count(),
        "runs_cancelled": WorkflowRun.objects.filter(state=RunState.CANCELLED).count(),
        "outbox_pending": OutboxEvent.objects.filter(published_at__isnull=True).count(),
        "outbox_published": OutboxEvent.objects.filter(published_at__isnull=False).count(),
    }


class Command(BaseCommand):
    help = "Assert the engine's safety properties over whatever is currently in the database."

    def add_arguments(self, parser):
        parser.add_argument("--expect-runs", type=int, default=None)
        parser.add_argument("--require-published", action="store_true")

    def collect_failures(self, options):
        failures = []

        duplicates = list(
            Charge.objects.values("order_id")
            .annotate(n=Count("id"))
            .filter(n__gt=1)
            .order_by("-n")[:10]
        )
        if duplicates:
            failures.append(f"orders charged more than once: {duplicates}")

        completed = WorkflowRun.objects.filter(state=RunState.COMPLETED)
        completed_orders = {o for o in completed.values_list("input__order_id", flat=True) if o}
        charged_orders = set(Charge.objects.values_list("order_id", flat=True))
        missing = completed_orders - charged_orders
        if missing:
            failures.append(
                f"{len(missing)} completed runs with no charge: {sorted(missing)[:10]}"
            )

        orphan = StepRun.objects.filter(
            state=StepState.RUNNING, lease_expires_at__isnull=True
        ).count()
        if orphan:
            failures.append(f"{orphan} running steps hold no lease")

        unfinished = StepRun.objects.filter(
            state=StepState.SUCCEEDED, finished_at__isnull=True
        ).count()
        if unfinished:
            failures.append(f"{unfinished} succeeded steps have no finished_at")

        incomplete = (
            WorkflowRun.objects.filter(state=RunState.COMPLETED)
            .exclude(steps__state=StepState.SUCCEEDED)
            .distinct()
            .count()
        )
        if incomplete:
            failures.append(f"{incomplete} completed runs contain a step that did not succeed")

        duplicate_events = list(
            OutboxEvent.objects.exclude(dedupe_key=None)
            .values("dedupe_key")
            .annotate(n=Count("id"))
            .filter(n__gt=1)[:10]
        )
        if duplicate_events:
            failures.append(f"outbox rows sharing a dedupe key: {duplicate_events}")

        if options["require_published"]:
            pending = OutboxEvent.objects.filter(published_at__isnull=True).count()
            if pending:
                failures.append(f"{pending} outbox events never published")

        if options["expect_runs"] is not None:
            terminal = WorkflowRun.objects.exclude(
                state__in=[RunState.PENDING, RunState.RUNNING]
            ).count()
            if terminal != options["expect_runs"]:
                failures.append(
                    f"expected {options['expect_runs']} terminal runs, found {terminal}"
                )

        return failures, len(duplicates)

    def handle(self, *args, **options):
        failures, duplicate_orders = self.collect_failures(options)
        s = summarise()

        write = self.stdout.write
        write("")
        write(self.style.MIGRATE_HEADING("delivery (at least once, by design)"))
        write(f"  steps                                {s['steps']}")
        write(f"  step attempts                        {s['attempts']}")
        write(f"  steps that ran more than once        {s['ran_twice']}")
        write(f"  steps reclaimed from a dead worker   {s['reclaimed_steps']} ({s['reclaims']} reclaims)")
        write("")
        write(self.style.MIGRATE_HEADING("effects (exactly once, by construction)"))
        write(f"  external effects performed           {s['effects_performed']}")
        write(f"  external effects served from cache   {s['effects_replayed']}")
        write(f"  physical gateway calls               {s['gateway_calls']}")
        write(f"  charges created                      {s['charges']}")
        write(
            f"  orders charged twice                 "
            f"{self.style.ERROR(duplicate_orders) if duplicate_orders else self.style.SUCCESS('0')}"
        )
        write("")
        write(self.style.MIGRATE_HEADING("runs"))
        write(f"  completed                            {s['runs_completed']}")
        write(f"  failed                               {s['runs_failed']}")
        write(f"  cancelled                            {s['runs_cancelled']}")
        write(
            f"  outbox pending / published           "
            f"{s['outbox_pending']} / {s['outbox_published']}"
        )
        write("")

        if failures:
            for line in failures:
                write(self.style.ERROR(f"  FAIL {line}"))
            raise SystemExit(1)

        write(self.style.SUCCESS("  PASS every invariant held"))
