"""Reverse planning: fixed deadline → required weekly/daily study load."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Literal, Optional

from models.schemas import CEFR_LEVELS
from services.goal_plan_config import (
    DEFAULT_PRACTICE_DAYS_PER_WEEK,
    DEFAULT_TUTOR_LESSON_MINUTES,
    DEFAULT_TUTOR_LESSONS_PER_WEEK,
    HOURS_PER_CEFR_LEVEL,
    PLAN_DISCLAIMER,
    SCENARIO_BASED_COEFFICIENT,
    STUCK_LOAD_MIN_CATEGORIES,
    STUCK_LOAD_MULTIPLIER,
)
from services.intensity_config import INTENSITY_PRESETS, normalize_intensity_preset

PlanStatus = Literal["on_track", "behind", "ahead"]


@dataclass
class StudyPlan:
    hours_per_week: float
    minutes_per_day: float
    tutor_hours_per_week: float
    self_study_hours_per_week: float
    total_hours: float
    hours_completed: float
    hours_remaining: float
    weeks_total: int
    weeks_elapsed: int
    weeks_remaining: int
    progress_percent: float
    status: PlanStatus
    status_message: str
    disclaimer: str
    goal_type: str
    scenario_description: Optional[str]
    current_cefr: str
    target_cefr: str
    start_cefr: str


def cefr_index(level: Optional[str]) -> Optional[int]:
    if not level:
        return None
    normalized = level.strip().upper()
    try:
        return CEFR_LEVELS.index(normalized)  # type: ignore[arg-type]
    except ValueError:
        return None


def cefr_score(level: Optional[str], fluency: Optional[float] = None) -> Optional[float]:
    """CEFR position with optional within-level progress from fluency (0–10)."""
    idx = cefr_index(level)
    if idx is None:
        return None
    if fluency is None:
        return float(idx) + 0.25
    return float(idx) + min(max(fluency, 0.0), 10.0) / 10.0 * 0.5


def _parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return None


def _report_date(report: dict) -> Optional[date]:
    raw = report.get("lesson_date") or report.get("created_at")
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, str):
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    return None


def _goal_type_coefficient(goal_type: Optional[str]) -> float:
    if goal_type == "scenario_based":
        return SCENARIO_BASED_COEFFICIENT
    return 1.0


def _round_hours(value: float) -> float:
    return round(value, 1)


def _round_minutes(value: float) -> float:
    return round(value, 0)


def _status_message(status: PlanStatus, hours_per_week: float) -> str:
    if status == "on_track":
        return "Идёте по плану"
    if status == "ahead":
        return "Опережаете график — можно сохранить текущий темп"
    return f"Отстаёте — нужно увеличить нагрузку до {_round_hours(hours_per_week)} ч/нед"


def compute_study_plan(
    student: dict,
    reports: list[dict],
    *,
    today: Optional[date] = None,
    completion_rate: Optional[float] = None,
    stuck_category_count: int = 0,
) -> Optional[StudyPlan]:
    """Build a reverse study plan from profile goal + lesson history."""
    today = today or date.today()

    target_cefr = student.get("target_cefr_level")
    goal_set_date = _parse_date(student.get("goal_set_date"))
    duration_weeks = student.get("target_duration_weeks")
    goal_type = student.get("goal_type") or "general_level"

    if not target_cefr or not goal_set_date:
        return None

    if not duration_weeks:
        target_date = _parse_date(student.get("target_date"))
        if target_date and target_date > goal_set_date:
            duration_weeks = max(1, (target_date - goal_set_date).days // 7)
        else:
            return None

    duration_weeks = int(duration_weeks)
    if duration_weeks < 1:
        return None

    sorted_reports = sorted(
        reports,
        key=lambda r: _report_date(r) or date.min,
    )
    if not sorted_reports:
        return None

    latest = sorted_reports[-1]
    current_cefr = latest.get("vocabulary_level") or student.get("goal_start_cefr_level")
    start_cefr = student.get("goal_start_cefr_level") or current_cefr

    current_score = cefr_score(current_cefr, latest.get("fluency_score"))
    start_score = cefr_score(start_cefr)
    target_score = cefr_score(target_cefr)

    if current_score is None or start_score is None or target_score is None:
        return None
    if target_score <= start_score:
        return None

    type_coeff = _goal_type_coefficient(goal_type)
    if stuck_category_count >= STUCK_LOAD_MIN_CATEGORIES:
        type_coeff *= STUCK_LOAD_MULTIPLIER
    total_distance = max(0.0, target_score - start_score)
    remaining_distance = max(0.0, target_score - current_score)

    total_hours = total_distance * HOURS_PER_CEFR_LEVEL * type_coeff

    weeks_elapsed = max(0, (today - goal_set_date).days // 7)

    hours_remaining = remaining_distance * HOURS_PER_CEFR_LEVEL * type_coeff

    intensity_key = normalize_intensity_preset(student.get("study_intensity_preset"))
    target_date = _parse_date(student.get("target_date"))
    plan_weeks_total = duration_weeks

    if intensity_key and target_date and target_date > goal_set_date:
        plan_weeks_total = max(1, math.ceil((target_date - goal_set_date).days / 7))
        weeks_remaining = max(1, math.ceil((target_date - today).days / 7))
    else:
        weeks_remaining = max(1, duration_weeks - weeks_elapsed)

    hours_per_week = hours_remaining / weeks_remaining

    if intensity_key:
        cfg = INTENSITY_PRESETS[intensity_key]
        tutor_lessons = int(cfg["tutor_lessons_per_week"])
        practice_days = int(cfg["practice_days_per_week"])
    else:
        tutor_lessons = int(student.get("tutor_lessons_per_week") or DEFAULT_TUTOR_LESSONS_PER_WEEK)
        practice_days = int(student.get("practice_days_per_week") or DEFAULT_PRACTICE_DAYS_PER_WEEK)
    tutor_minutes = int(student.get("tutor_lesson_minutes") or DEFAULT_TUTOR_LESSON_MINUTES)

    tutor_hours_per_week = tutor_lessons * tutor_minutes / 60.0
    self_study_hours_per_week = max(0.0, hours_per_week - tutor_hours_per_week)

    minutes_per_day = (hours_per_week / practice_days) * 60.0

    reports_since_goal = [
        r for r in sorted_reports if (_report_date(r) or date.min) >= goal_set_date
    ]
    tutor_hours_completed = len(reports_since_goal) * tutor_minutes / 60.0

    time_progress = min(1.0, weeks_elapsed / plan_weeks_total) if plan_weeks_total else 0.0
    level_progress = (
        (current_score - start_score) / total_distance if total_distance > 0 else 0.0
    )
    level_progress = min(1.0, max(0.0, level_progress))

    hours_completed = max(tutor_hours_completed, level_progress * total_hours)
    hours_completed = min(hours_completed, total_hours)
    progress_percent = (hours_completed / total_hours * 100.0) if total_hours > 0 else 0.0

    if level_progress >= time_progress * 1.1:
        status: PlanStatus = "ahead"
    elif level_progress >= time_progress * 0.85:
        status = "on_track"
    else:
        status = "behind"

    if (
        completion_rate is not None
        and completion_rate < 0.7
        and completion_rate > 0
    ):
        catch_up = min(2.0, 0.7 / completion_rate)
        hours_per_week = _round_hours(hours_per_week * catch_up)
        minutes_per_day = _round_minutes(minutes_per_day * catch_up)
        self_study_hours_per_week = max(0.0, hours_per_week - tutor_hours_per_week)
        status = "behind"
        status_message = (
            f"Темп ниже плана — необходимая нагрузка выросла до "
            f"{_round_hours(hours_per_week)} ч/нед"
        )
    else:
        status_message = _status_message(status, hours_per_week)

    return StudyPlan(
        hours_per_week=_round_hours(hours_per_week),
        minutes_per_day=_round_minutes(minutes_per_day),
        tutor_hours_per_week=_round_hours(tutor_hours_per_week),
        self_study_hours_per_week=_round_hours(self_study_hours_per_week),
        total_hours=_round_hours(total_hours),
        hours_completed=_round_hours(hours_completed),
        hours_remaining=_round_hours(max(0.0, total_hours - hours_completed)),
        weeks_total=plan_weeks_total,
        weeks_elapsed=weeks_elapsed,
        weeks_remaining=weeks_remaining,
        progress_percent=round(progress_percent, 1),
        status=status,
        status_message=status_message,
        disclaimer=PLAN_DISCLAIMER,
        goal_type=goal_type,
        scenario_description=student.get("scenario_description")
        or student.get("goal_label"),
        current_cefr=current_cefr or "—",
        target_cefr=target_cefr,
        start_cefr=start_cefr or current_cefr or "—",
    )


def study_plan_to_dict(plan: StudyPlan) -> dict:
    return {
        "hours_per_week": plan.hours_per_week,
        "minutes_per_day": plan.minutes_per_day,
        "tutor_hours_per_week": plan.tutor_hours_per_week,
        "self_study_hours_per_week": plan.self_study_hours_per_week,
        "total_hours": plan.total_hours,
        "hours_completed": plan.hours_completed,
        "hours_remaining": plan.hours_remaining,
        "weeks_total": plan.weeks_total,
        "weeks_elapsed": plan.weeks_elapsed,
        "weeks_remaining": plan.weeks_remaining,
        "progress_percent": plan.progress_percent,
        "status": plan.status,
        "status_message": plan.status_message,
        "disclaimer": plan.disclaimer,
        "goal_type": plan.goal_type,
        "scenario_description": plan.scenario_description,
        "current_cefr": plan.current_cefr,
        "target_cefr": plan.target_cefr,
        "start_cefr": plan.start_cefr,
    }
