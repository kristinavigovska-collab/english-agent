"""Tiny in-memory per-IP limiter for the public drill endpoint.

State lives in the process (Render free plan = one instance) and resets on restart,
which is acceptable for a demo cost cap. It is not an auth mechanism.
"""
from __future__ import annotations

import datetime
import os
import threading
from typing import Dict, Tuple

_lock = threading.Lock()
_usage: Dict[str, Tuple[str, int]] = {}
_inflight: Dict[str, int] = {}
_global: Dict[str, int] = {}          # day -> analyses started by everyone together


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def daily_limit() -> int:
    """Analyses per IP per day (an office shares one IP, so raise this for team tests)."""
    return _int_env("DRILL_DAILY_LIMIT", 3)


def max_parallel() -> int:
    """Analyses one IP may run at the same time."""
    return max(1, _int_env("DRILL_MAX_PARALLEL", 1))


def global_daily_limit() -> int:
    """Analyses per day for the whole site together; 0 = no overall cap. Protects the budget."""
    return _int_env("DRILL_GLOBAL_DAILY_LIMIT", 0)


def _today() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%d")


def acquire(ip: str) -> bool:
    """Reserve one analysis for `ip`. False when a limit is reached."""
    if os.getenv("DRILL_DISABLE_LIMIT") == "1":
        return True
    with _lock:
        today = _today()
        day, n = _usage.get(ip, (today, 0))
        if day != today:
            day, n = today, 0
        cap = global_daily_limit()
        if n >= daily_limit() or _inflight.get(ip, 0) >= max_parallel() or (cap and _global.get(today, 0) >= cap):
            return False
        _usage[ip] = (day, n + 1)
        _inflight[ip] = _inflight.get(ip, 0) + 1
        if today not in _global:
            _global.clear()  # a new day: forget yesterday's total
        _global[today] = _global.get(today, 0) + 1
        return True


def release(ip: str, refund: bool = False) -> None:
    with _lock:
        left = _inflight.get(ip, 0) - 1
        if left > 0:
            _inflight[ip] = left
        else:
            _inflight.pop(ip, None)
        if refund and ip in _usage:
            day, n = _usage[ip]
            _usage[ip] = (day, max(0, n - 1))
            today = _today()
            if _global.get(today):
                _global[today] -= 1


def reset() -> None:
    with _lock:
        _usage.clear()
        _inflight.clear()
        _global.clear()
        _tts_usage.clear()


_tts_usage: Dict[str, Tuple[str, int]] = {}


def tts_daily_chars() -> int:
    try:
        return int(os.getenv("DRILL_TTS_DAILY_CHARS", "12000"))
    except ValueError:
        return 12000


def acquire_tts(ip: str, chars: int) -> bool:
    """Reserve `chars` characters of voice generation for `ip` today (cache hits are not charged by the caller)."""
    if os.getenv("DRILL_DISABLE_LIMIT") == "1":
        return True
    with _lock:
        day, used = _tts_usage.get(ip, (_today(), 0))
        if day != _today():
            day, used = _today(), 0
        if used + chars > tts_daily_chars():
            return False
        _tts_usage[ip] = (day, used + chars)
        return True
