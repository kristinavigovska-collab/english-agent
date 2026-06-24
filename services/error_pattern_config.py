"""Thresholds for recurring error pattern tracking — re-exported from app_config (ADR-002)."""

from services.app_config import (
    RESOLVED_ABSENCE_LESSONS,
    STUCK_LESSONS_THRESHOLD,
    STUCK_LOAD_MIN_CATEGORIES,
    STUCK_LOAD_MULTIPLIER,
)

__all__ = [
    "STUCK_LESSONS_THRESHOLD",
    "RESOLVED_ABSENCE_LESSONS",
    "STUCK_LOAD_MULTIPLIER",
    "STUCK_LOAD_MIN_CATEGORIES",
]
