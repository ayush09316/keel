from django.apps import AppConfig


class EngineConfig(AppConfig):
    name = "engine"
    verbose_name = "Keel engine"

    def ready(self):
        from .registry import autodiscover

        autodiscover()
