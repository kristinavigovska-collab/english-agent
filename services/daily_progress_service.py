"""Daily progress tracker — habit grid, lesson auto-mark, self-practice."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Literal, Optional

from services.goal_plan_config import (
    DEFAULT_PRACTICE_DAYS_PER_WEEK,
    DEFAULT_TUTOR_LESSON_MINUTES,
)
from services.goal_plan_service import StudyPlan, _parse_date, _report_date

DayState = Literal["future", "missed", "completed", "partial", "lesson"]
ProgressSource = Literal["lesson", "self_practice"]

PACE_WARNING_THRESHOLD = 0.7
RECENT_DAYS_WINDOW = 14


@dataclass
class DailyProgressDay:
    date: date
    day_index: int
    planned_minutes: int
    completed: bool
    completed_minutes: Optional[int]
    source: Optional[str]
    state: DayState


@dataclass
class ProgressTracker:
    days: list[DailyProgressDay]
    weeks: list[list[DailyProgressDay]]
    completed_days: int
    planned_days_elapsed: int
    streak: int
    pace_warning: Optional[str]
    can_mark_today: bool
    today_planned_minutes: int
    goal_start_date: date
    goal_end_date: date


def goal_period(student: dict) -> tuple[Optional[date], Optional[date], int]:
    start = _parse_date(student.get("goal_set_date"))
    if not start:
        return None, None, 0

    duration_weeks = student.get("target_duration_weeks")
    end = _parse_date(student.get("target_date"))
    if duration_weeks:
        end = end or (start + timedelta(weeks=int(duration_weeks)))
    if not end or end <= start:
        return None, None, 0

    total_days = (end - start).days + 1
    return start, end, total_days


def recent_completion_rate(
    days: list[DailyProgressDay],
    today: date,
    window: int = RECENT_DAYS_WINDOW,
) -> Optional[float]:
    window_start = today - timedelta(days=window - 1)
    eligible = [
        d
        for d in days
        if window_start <= d.date <= today and d.date <= today and d.planned_minutes > 0
    ]
    if not eligible:
        return None
    completed = sum(1 for d in eligible if d.completed)
    return completed / len(eligible)


def compute_streak(days: list[DailyProgressDay], today: date) -> int:
    by_date = {d.date: d for d in days}
    streak = 0
    cursor = today
    while cursor in by_date:
        day = by_date[cursor]
        if not day.completed:
            if streak == 0 and cursor == today:
                cursor -= timedelta(days=1)
                continue
            break
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _day_state(
    day: date,
    today: date,
    completed: bool,
    planned_minutes: int,
    completed_minutes: Optional[int],
    source: Optional[str],
) -> DayState:
    if day > today:
        return "future"
    if source == "lesson" and completed:
        return "lesson"
    if completed:
        if (
            completed_minutes is not None
            and planned_minutes > 0
            and completed_minutes < planned_minutes
        ):
            return "partial"
        return "completed"
    return "missed"


def lesson_dates(reports: list[dict], period_start: date, period_end: date) -> dict[date, int]:
    tutor_minutes = DEFAULT_TUTOR_LESSON_MINUTES
    dates: dict[date, int] = {}
    for report in reports:
        report_date = _report_date(report)
        if not report_date or report_date < period_start or report_date > period_end:
            continue
        dates[report_date] = tutor_minutes
    return dates


def build_daily_rows_for_sync(
    student: dict,
    study_plan: StudyPlan,
    reports: list[dict],
    existing: dict[date, dict],
    today: date,
) -> list[dict]:
    """Rows to upsert: planned minutes for each day + auto lesson marks."""
    start, end, _ = goal_period(student)
    if not start or not end:
        return []

    lesson_days = lesson_dates(reports, start, end)
    practice_days = int(student.get("practice_days_per_week") or DEFAULT_PRACTICE_DAYS_PER_WEEK)
    planned_daily = int(study_plan.minutes_per_day)
    tutor_minutes = int(student.get("tutor_lesson_minutes") or DEFAULT_TUTOR_LESSON_MINUTES)

    rows: list[dict] = []
    cursor = start
    day_index = 0
    while cursor <= end:
        day_index += 1
        is_practice_day = day_index % 7 < practice_days or practice_days >= 7
        planned = planned_daily if is_practice_day else 0

        if cursor in lesson_days:
            planned = max(planned, tutor_minutes)

        existing_row = existing.get(cursor, {})
        source = existing_row.get("source")
        completed = bool(existing_row.get("completed"))
        completed_minutes = existing_row.get("completed_minutes")

        if cursor in lesson_days:
            source = "lesson"
            completed = True
            completed_minutes = lesson_days[cursor]

        rows.append(
            {
                "progress_date": cursor.isoformat(),
                "planned_minutes": planned,
                "completed": completed,
                "completed_minutes": completed_minutes,
                "source": source,
            }
        )
        cursor += timedelta(days=1)

    return rows


def build_tracker(
    student: dict,
    study_plan: StudyPlan,
    stored_rows: list[dict],
    reports: list[dict],
    *,
    today: Optional[date] = None,
) -> Optional[ProgressTracker]:
    today = today or date.today()
    start, end, _ = goal_period(student)
    if not start or not end:
        return None

    stored_by_date = {_parse_date(r.get("progress_date")): r for r in stored_rows}
    stored_by_date = {k: v for k, v in stored_by_date.items() if k is not None}

    lesson_day_map = lesson_dates(reports, start, end)
    days: list[DailyProgressDay] = []
    cursor = start
    index = 0

    while cursor <= end:
        index += 1
        row = stored_by_date.get(cursor, {})
        source = row.get("source")
        completed = bool(row.get("completed"))
        completed_minutes = row.get("completed_minutes")
        planned = int(row.get("planned_minutes") or study_plan.minutes_per_day)

        if cursor in lesson_day_map and not completed:
            source = "lesson"
            completed = True
            completed_minutes = lesson_day_map[cursor]

        state = _day_state(cursor, today, completed, planned, completed_minutes, source)
        days.append(
            DailyProgressDay(
                date=cursor,
                day_index=index,
                planned_minutes=planned,
                completed=completed,
                completed_minutes=completed_minutes,
                source=source,
                state=state,
            )
        )
        cursor += timedelta(days=1)

    elapsed = [d for d in days if d.date <= today and d.planned_minutes > 0]
    completed_days = sum(1 for d in elapsed if d.completed)
    streak = compute_streak(days, today)

    rate = recent_completion_rate(days, today)
    pace_warning = None
    if rate is not None and rate < PACE_WARNING_THRESHOLD:
        pace_warning = (
            f"Темп ниже плана — выполнено {int(rate * 100)}% дней за последние "
            f"{RECENT_DAYS_WINDOW} дней. Необходимая нагрузка выросла до "
            f"{study_plan.hours_per_week} ч/нед"
        )

    today_row = stored_by_date.get(today)
    today_has_lesson = today in lesson_day_map
    today_completed = bool(today_row and today_row.get("completed")) or today_has_lesson
    can_mark_today = (
        start <= today <= end and not today_completed and not today_has_lesson
    )

    weeks: list[list[DailyProgressDay]] = []
    for i in range(0, len(days), 7):
        weeks.append(days[i : i + 7])

    return ProgressTracker(
        days=days,
        weeks=weeks,
        completed_days=completed_days,
        planned_days_elapsed=len(elapsed),
        streak=streak,
        pace_warning=pace_warning,
        can_mark_today=can_mark_today,
        today_planned_minutes=int(study_plan.minutes_per_day),
        goal_start_date=start,
        goal_end_date=end,
    )


def tracker_to_dict(tracker: ProgressTracker) -> dict:
    def day_dict(d: DailyProgressDay) -> dict:
        return {
            "date": d.date.isoformat(),
            "day_index": d.day_index,
            "planned_minutes": d.planned_minutes,
            "completed": d.completed,
            "completed_minutes": d.completed_minutes,
            "source": d.source,
            "state": d.state,
        }

    return {
        "days": [day_dict(d) for d in tracker.days],
        "weeks": [[day_dict(d) for d in week] for week in tracker.weeks],
        "completed_days": tracker.completed_days,
        "planned_days_elapsed": tracker.planned_days_elapsed,
        "streak": tracker.streak,
        "pace_warning": tracker.pace_warning,
        "can_mark_today": tracker.can_mark_today,
        "today_planned_minutes": tracker.today_planned_minutes,
        "goal_start_date": tracker.goal_start_date.isoformat(),
        "goal_end_date": tracker.goal_end_date.isoformat(),
    }
