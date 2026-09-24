class KeelError(Exception):
    pass


class WorkflowNotRegistered(KeelError):
    pass


class StepNotRegistered(KeelError):
    pass


class NonRetryableError(KeelError):
    """Raised by a step handler when retrying cannot possibly help.

    The executor sends the step straight to the dead-letter queue instead of
    burning the remaining attempts on a failure that is already permanent.
    """


class LeaseLostError(KeelError):
    """The step was reclaimed by the reaper while this worker was still running it."""
