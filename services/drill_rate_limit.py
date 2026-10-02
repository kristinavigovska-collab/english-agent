"""Tiny in-memory per-IP limiter for the public drill endpoint.

State lives in the process (Render free plan = one instance) and resets on restart,
which is acceptable for a demo cost cap. It is not an auth mechanism.
"""
from __future__ import annotations

import datetime
import os
import threading
from typing import Dict, Set, Tuple

_lock = threading.Lock()
_usage: Dict[str, Tuple[str, int]] = {}
_inflight: Set[str] = set()


def daily_limit() -> int:
    try:
        return int(os.getenv("DRILL_DAILY_LIMIT", "3"))
    except ValueError:
        return 3


def _today() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%d")


def acquire(ip: str) -> bool:
    """Reserve one analysis for `ip`. False when over the daily limit or one is already running."""
    if os.getenv("DRILL_DISABLE_LIMIT") == "1":
        return True
    with _lock:
        day, n = _usage.get(ip, (_today(), 0))
        if day != _today():
            day, n = _today(), 0
        if n >= daily_limit() or ip in _inflight:
            return False
        _usage[ip] = (day, n + 1)
        _inflight.add(ip)
        return True


def release(ip: str, refund: bool = False) -> None:
    with _lock:
        _inflight.discard(ip)
        if refund and ip in _usage:
            day, n = _usage[ip]
            _usage[ip] = (day, max(0, n - 1))


def reset() -> None:
    with _lock:
        _usage.clear()
        _inflight.clear()
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
