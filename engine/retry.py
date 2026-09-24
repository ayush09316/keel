import random

from django.conf import settings


def backoff_seconds(attempt, base=None, maximum=None, jitter=None, rng=random):
    conf = settings.KEEL
    base = conf["RETRY_BASE_SECONDS"] if base is None else base
    maximum = conf["RETRY_MAX_SECONDS"] if maximum is None else maximum
    jitter = conf["RETRY_JITTER"] if jitter is None else jitter

    exponent = max(attempt - 1, 0)
    raw = base * (2**exponent)
    capped = min(raw, maximum)
    if jitter <= 0:
        return capped
    spread = capped * jitter
    return max(0.0, capped + rng.uniform(-spread, spread))
