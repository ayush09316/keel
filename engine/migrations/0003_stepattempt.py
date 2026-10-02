import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("engine", "0002_steprun_effects_performed_steprun_effects_replayed"),
    ]

    operations = [
        migrations.CreateModel(
            name="StepAttempt",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("attempt", models.IntegerField()),
                ("worker_id", models.CharField(max_length=128)),
                (
                    "outcome",
                    models.CharField(
                        choices=[
                            ("running", "Running"),
                            ("succeeded", "Succeeded"),
                            ("retry", "Retry"),
                            ("dead", "Dead"),
                            ("lease_expired", "Lease Expired"),
                            ("fenced", "Fenced"),
                        ],
                        default="running",
                        max_length=16,
                    ),
                ),
                ("started_at", models.DateTimeField()),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("reclaimed_at", models.DateTimeField(blank=True, null=True)),
                ("fenced_at", models.DateTimeField(blank=True, null=True)),
                ("effects_performed", models.IntegerField(default=0)),
                ("effects_replayed", models.IntegerField(default=0)),
                ("events", models.IntegerField(default=0)),
                ("error_type", models.CharField(blank=True, default="", max_length=128)),
                ("error", models.CharField(blank=True, default="", max_length=500)),
                (
                    "run",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attempts",
                        to="engine.workflowrun",
                    ),
                ),
                (
                    "step",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attempts",
                        to="engine.steprun",
                    ),
                ),
            ],
            options={
                "db_table": "keel_step_attempt",
                "ordering": ["id"],
                "indexes": [
                    models.Index(fields=["step", "attempt"], name="keel_attempt_step_idx"),
                    models.Index(fields=["worker_id", "finished_at"], name="keel_attempt_worker_idx"),
                ],
            },
        ),
    ]
