from dataclasses import dataclass, field

from .errors import StepNotRegistered, WorkflowNotRegistered


@dataclass(frozen=True)
class Step:
    name: str
    max_attempts: int = 3
    description: str = ""
    tags: tuple = field(default_factory=tuple)


class Workflow:
    name = ""
    steps = ()
    description = ""

    def step_names(self):
        return [s.name for s in self.steps]

    def step(self, name):
        for s in self.steps:
            if s.name == name:
                return s
        raise StepNotRegistered(f"{self.name} has no step {name!r}")

    def handler(self, name):
        handler = getattr(self, name, None)
        if handler is None or not callable(handler):
            raise StepNotRegistered(f"{self.name}.{name} has no handler method")
        return handler


class Registry:
    def __init__(self):
        self._workflows = {}

    def register(self, workflow_cls):
        instance = workflow_cls()
        if not instance.name:
            raise ValueError(f"{workflow_cls.__name__} must declare a name")
        if not instance.steps:
            raise ValueError(f"{instance.name} must declare at least one step")
        seen = set()
        for s in instance.steps:
            if s.name in seen:
                raise ValueError(f"{instance.name} declares step {s.name!r} twice")
            seen.add(s.name)
            instance.handler(s.name)
        self._workflows[instance.name] = instance
        return workflow_cls

    def get(self, name):
        try:
            return self._workflows[name]
        except KeyError:
            raise WorkflowNotRegistered(f"no workflow registered as {name!r}") from None

    def names(self):
        return sorted(self._workflows)

    def all(self):
        return [self._workflows[n] for n in self.names()]

    def clear(self):
        self._workflows.clear()


registry = Registry()


def workflow(name, description=""):
    def decorate(cls):
        cls.name = name
        if description:
            cls.description = description
        return registry.register(cls)

    return decorate


def autodiscover():
    from django.apps import apps
    from django.utils.module_loading import module_has_submodule
    from importlib import import_module

    for config in apps.get_app_configs():
        if module_has_submodule(config.module, "workflows"):
            import_module(f"{config.name}.workflows")
