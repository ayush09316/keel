import pytest

from engine.errors import NonRetryableError
from engine.registry import Step, Workflow, registry


class Recorder:
    def __init__(self):
        self.calls = []
        self.fail_until = {}

    def reset(self):
        self.calls.clear()
        self.fail_until.clear()


recorder = Recorder()


class TwoStep(Workflow):
    name = "t_two_step"
    steps = [Step("first", max_attempts=3), Step("second", max_attempts=3)]

    def first(self, ctx):
        recorder.calls.append(("first", ctx.attempt))
        ctx.emit("t.first.done", {"run": ctx.run_id})
        return {"value": ctx.input.get("value", 1) * 2}

    def second(self, ctx):
        recorder.calls.append(("second", ctx.attempt))
        doubled = ctx.output_of("first")["value"]
        ctx.emit("t.second.done", {"run": ctx.run_id, "total": doubled + 1})
        return {"total": doubled + 1}


class Flaky(Workflow):
    name = "t_flaky"
    steps = [Step("wobble", max_attempts=3)]

    def wobble(self, ctx):
        recorder.calls.append(("wobble", ctx.attempt))
        if ctx.attempt < recorder.fail_until.get("wobble", 0):
            raise RuntimeError(f"boom on attempt {ctx.attempt}")
        return {"attempt": ctx.attempt}


class FlakyThenDone(Workflow):
    name = "t_flaky_then_done"
    steps = [Step("wobble", max_attempts=1), Step("after", max_attempts=3)]

    def wobble(self, ctx):
        recorder.calls.append(("wobble", ctx.attempt))
        if ctx.attempt < recorder.fail_until.get("wobble", 0):
            raise RuntimeError(f"boom on attempt {ctx.attempt}")
        return {"attempt": ctx.attempt}

    def after(self, ctx):
        recorder.calls.append(("after", ctx.attempt))
        return {"ok": True}


class Poison(Workflow):
    name = "t_poison"
    steps = [Step("always_fails", max_attempts=5)]

    def always_fails(self, ctx):
        recorder.calls.append(("always_fails", ctx.attempt))
        raise NonRetryableError("this input can never work")


class Effectful(Workflow):
    name = "t_effectful"
    steps = [Step("charge", max_attempts=5)]

    def charge(self, ctx):
        def perform(key):
            recorder.calls.append(("gateway", key))
            return {"charged": True, "key": key}

        result = ctx.once("charge", perform)
        if ctx.attempt < recorder.fail_until.get("charge", 0):
            raise RuntimeError("crashed after the money moved")
        return result


class Unserialisable(Workflow):
    name = "t_unserialisable"
    steps = [Step("bad", max_attempts=4)]

    def bad(self, ctx):
        return {"when": object()}


@pytest.fixture(autouse=True)
def test_workflows():
    for cls in (TwoStep, Flaky, FlakyThenDone, Poison, Effectful, Unserialisable):
        registry.register(cls)
    recorder.reset()
    yield recorder
    recorder.reset()


@pytest.fixture
def fast_retries(settings):
    settings.KEEL = {**settings.KEEL, "RETRY_BASE_SECONDS": 0.0, "RETRY_JITTER": 0.0}
    return settings
