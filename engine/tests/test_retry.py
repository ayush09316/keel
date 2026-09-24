import pytest

from engine.retry import backoff_seconds


def test_backoff_doubles_without_jitter():
    delays = [backoff_seconds(a, base=1, maximum=1000, jitter=0) for a in range(1, 6)]
    assert delays == [1, 2, 4, 8, 16]


def test_backoff_respects_the_ceiling():
    assert backoff_seconds(20, base=1, maximum=30, jitter=0) == 30


def test_backoff_attempt_zero_is_the_base():
    assert backoff_seconds(0, base=2, maximum=100, jitter=0) == 2


@pytest.mark.parametrize("attempt", [1, 3, 7])
def test_jitter_stays_inside_the_band(attempt):
    for _ in range(200):
        delay = backoff_seconds(attempt, base=1, maximum=1000, jitter=0.3)
        centre = 2 ** (attempt - 1)
        assert centre * 0.7 - 1e-9 <= delay <= centre * 1.3 + 1e-9


def test_jitter_actually_varies():
    values = {backoff_seconds(5, base=1, maximum=1000, jitter=0.3) for _ in range(50)}
    assert len(values) > 40
