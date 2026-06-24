"""
ADR-002: Single source of truth for dashboard + API constants.

Server owns all calculation constants. GET /api/config serializes this module.
Client loads CONFIG once — no hardcoded duplicates in dashboard.js.
"""

from __future__ import annotations

from services.error_category_config import ERROR_CATEGORIES
from services.intensity_config import INTENSITY_PRESETS

CEFR_LEVELS: tuple[str, ...] = ("A1", "A2", "B1", "B2", "C1", "C2")

CEFR_LEVEL_NAMES: dict[str, str] = {
    "A1": "Beginner",
    "A2": "Elementary",
    "B1": "Intermediate",
    "B2": "Upper-Intermediate",
    "C1": "Advanced",
    "C2": "Proficiency",
}

# Default hours per full CEFR level step (goal_plan_service uses this today).
HOURS_PER_CEFR_LEVEL = 190

CEFR_HOURS_PER_TRANSITION: dict[str, int] = {
    "A1_A2": 180,
    "A2_B1": 190,
    "B1_B2": 200,
    "B2_C1": 210,
    "C1_C2": 220,
}

SCENARIO_BASED_COEFFICIENT = 0.5

STUCK_LESSONS_THRESHOLD = 3
RESOLVED_ABSENCE_LESSONS = 2
STUCK_LOAD_MULTIPLIER = 1.10
STUCK_LOAD_MIN_CATEGORIES = 2

DEFAULT_TUTOR_LESSONS_PER_WEEK = 2
DEFAULT_TUTOR_LESSON_MINUTES = 60
DEFAULT_PRACTICE_DAYS_PER_WEEK = 6

PLAN_DISCLAIMER = (
    "Расчёт на основе средних нормативов CEFR (~190 ч/уровень), "
    "уточняется по мере вашего прогресса"
)
PLAN_DISCLAIMER_SHORT = "На основе нормативов CEFR"

DURATION_WEEKS_MIN = 1
DURATION_WEEKS_MAX = 104
ACTIVITY_HEATMAP_WEEKS = 16
MIN_LESSONS_FOR_FORECAST = 5

# UI-only (not used in Python calculations)
CEFR_CAPTION = "Уровень CEFR (международная шкала A1–C2)"


def intensity_presets_for_api() -> dict[str, dict]:
    """API shape for dashboard intensity chips."""
    return {
        key: {
            "label": cfg["label"],
            "classes_per_week": cfg["classes_per_week"],
            "tutor_lessons_per_week": cfg["tutor_lessons_per_week"],
            "practice_days_per_week": cfg["practice_days_per_week"],
        }
        for key, cfg in INTENSITY_PRESETS.items()
    }


def get_public_config() -> dict:
    return {
        "cefr_levels": list(CEFR_LEVELS),
        "cefr_level_names": dict(CEFR_LEVEL_NAMES),
        "cefr_hours_per_level": dict(CEFR_HOURS_PER_TRANSITION),
        "cefr_hours_default": HOURS_PER_CEFR_LEVEL,
        "scenario_based_coefficient": SCENARIO_BASED_COEFFICIENT,
        "stuck_threshold_lessons": STUCK_LESSONS_THRESHOLD,
        "resolved_absence_lessons": RESOLVED_ABSENCE_LESSONS,
        "stuck_multiplier": STUCK_LOAD_MULTIPLIER,
        "stuck_load_min_categories": STUCK_LOAD_MIN_CATEGORIES,
        "intensity_presets": intensity_presets_for_api(),
        "plan_disclaimer": PLAN_DISCLAIMER,
        "plan_disclaimer_short": PLAN_DISCLAIMER_SHORT,
        "duration_weeks_min": DURATION_WEEKS_MIN,
        "duration_weeks_max": DURATION_WEEKS_MAX,
        "activity_heatmap_weeks": ACTIVITY_HEATMAP_WEEKS,
        "min_lessons_for_forecast": MIN_LESSONS_FOR_FORECAST,
        "cefr_caption": CEFR_CAPTION,
        "error_category_labels": dict(ERROR_CATEGORIES),
        "default_tutor_lessons_per_week": DEFAULT_TUTOR_LESSONS_PER_WEEK,
        "default_tutor_lesson_minutes": DEFAULT_TUTOR_LESSON_MINUTES,
        "default_practice_days_per_week": DEFAULT_PRACTICE_DAYS_PER_WEEK,
    }
