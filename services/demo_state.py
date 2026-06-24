"""
In-memory demo state for /api/demo/* (ADR-002).

FIXTURE: base reports/goal from data/fixtures/*.json; recalculated via Python services.
Demo goal edits and curriculum completions persist until process restart.
"""

from __future__ import annotations

import copy
import json
import logging
from datetime import date
from pathlib import Path
from typing import Any, Optional

from services import daily_progress_service, error_pattern_service, goal_plan_service
from services.curriculum_service import build_curriculum

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "data" / "fixtures"

DEMO_PROGRAM_ID = "general-intermediate"

_default_goal: dict[str, Any] = {
    "goal_type": "scenario_based",
    "target_cefr_level": "C1",
    "target_duration_weeks": 26,
    "target_date": "2026-12-01",
    "goal_label": "собеседование на позицию менеджера",
    "scenario_description": "собеседование на позицию менеджера",
    "goal_set_date": "2026-04-14",
    "goal_start_cefr_level": "A1",
    "tutor_lessons_per_week": 2,
    "tutor_lesson_minutes": 60,
    "practice_days_per_week": 6,
    "study_intensity_preset": None,
}

_demo_goal: dict[str, Any] = copy.deepcopy(_default_goal)
_demo_reports: list[dict[str, Any]] = []
_extra_completed: set[int] = set()
_loaded = False


def _load_fixture(name: str) -> Any:
    path = FIXTURES / name
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def ensure_loaded() -> None:
    global _loaded, _demo_reports, _demo_goal
    if _loaded:
        return
    bundle = _load_fixture("reports.json")
    if bundle:
        _demo_reports = copy.deepcopy(bundle.get("reports") or [])
        goal_fields = {
            k: bundle.get(k)
            for k in (
                "target_cefr_level",
                "target_date",
                "goal_label",
                "goal_set_date",
                "goal_type",
                "target_duration_weeks",
                "scenario_description",
                "goal_start_cefr_level",
                "tutor_lessons_per_week",
                "tutor_lesson_minutes",
                "practice_days_per_week",
                "study_intensity_preset",
            )
        }
        _demo_goal = {**_default_goal, **{k: v for k, v in goal_fields.items() if v is not None}}
    _loaded = True


def reset_demo() -> None:
    global _demo_goal, _demo_reports, _extra_completed, _loaded
    _loaded = False
    _extra_completed = set()
    ensure_loaded()


def update_goal(updates: dict[str, Any]) -> None:
    ensure_loaded()
    _demo_goal.update({k: v for k, v in updates.items() if v is not None})


def mark_class_complete(class_id: int, *, lesson: bool = True, self_study: bool = True) -> None:
    ensure_loaded()
    _extra_completed.add(int(class_id))
    logger.info(
        "[DEV] Demo completion recorded in memory only: class_id=%s lesson=%s self_study=%s",
        class_id,
        lesson,
        self_study,
    )


def _annotate_reports(
    reports: list[dict], tracking: error_pattern_service.ErrorTrackingView
) -> list[dict]:
    out = []
    sorted_rows = sorted(reports, key=lambda r: r.get("created_at") or "", reverse=True)
    latest_id = sorted_rows[0]["id"] if sorted_rows else None
    for row in reports:
        item = copy.deepcopy(row)
        grammar = tracking.grammar_annotations.get(row["id"]) or row.get("grammar_errors") or []
        item["grammar_errors"] = grammar
        if row["id"] == latest_id:
            item["prioritized_weak_topics"] = error_pattern_service.build_prioritized_weak_topics(
                tracking, row.get("weak_topics") or []
            )
        else:
            item["prioritized_weak_topics"] = []
        out.append(item)
    return out


def build_bundle(*, today: Optional[date] = None) -> dict[str, Any]:
    ensure_loaded()
    today = today or date(2026, 6, 1)

    tracking_view = error_pattern_service.build_error_tracking(_demo_reports)
    stuck_count = len(tracking_view.stuck_patterns)
    plan = goal_plan_service.compute_study_plan(
        _demo_goal, _demo_reports, stuck_category_count=stuck_count, today=today
    )

    progress_tracker = None
    if plan:
        period_start, period_end, _ = daily_progress_service.goal_period(_demo_goal)
        if period_start and period_end:
            sync_rows = daily_progress_service.build_daily_rows_for_sync(
                _demo_goal, plan, _demo_reports, {}, today
            )
            tracker = daily_progress_service.build_tracker(
                _demo_goal, plan, sync_rows, _demo_reports
            )
            if tracker:
                progress_tracker = daily_progress_service.tracker_to_dict(tracker)

    error_payload = error_pattern_service.tracking_to_dict(tracking_view)
    latest = _demo_reports[0] if _demo_reports else None
    if latest:
        error_payload["prioritized_weak_topics"] = (
            error_pattern_service.build_prioritized_weak_topics(
                tracking_view, latest.get("weak_topics") or []
            )
        )

    study_plan = goal_plan_service.study_plan_to_dict(plan) if plan else None
    reports = _annotate_reports(_demo_reports, tracking_view)

    curriculum = build_curriculum(
        DEMO_PROGRAM_ID,
        _demo_reports,
        progress_tracker,
        extra_completed_class_nums=_extra_completed or None,
    )

    return {
        "student_id": "demo",
        "student_name": "Кристина Виговская",
        "student_email": "kristina.vigovska@gmail.com",
        "reports": reports,
        "study_plan": study_plan,
        "progress_tracker": progress_tracker,
        "error_tracking": error_payload,
        "curriculum": curriculum,
        **_demo_goal,
    }
