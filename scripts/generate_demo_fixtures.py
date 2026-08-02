#!/usr/bin/env python3
"""
Generate demo API fixtures from Python services (ADR-002).

Run: python scripts/generate_demo_fixtures.py

FIXTURE: generated from goal_plan_service + error_pattern_service + daily_progress_service
Update when calculation formulas change in Python.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from services import daily_progress_service, error_pattern_service, goal_plan_service
from services.curriculum_service import build_curriculum

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "data" / "fixtures"
FIXTURES.mkdir(parents=True, exist_ok=True)

DEMO_GOAL = {
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

DEMO_REPORTS = [
    {
        "id": "demo-7",
        "lesson_id": "demo-lesson-7",
        "student_id": "demo",
        "lesson_date": "2026-05-28T14:00:00Z",
        "created_at": "2026-05-28T14:00:00Z",
        "grammar_errors": [
            {
                "error": "She don't like spicy food",
                "correction": "She doesn't like spicy food",
                "explanation": "Present Simple 3rd person.",
                "error_category": "third_person_singular",
            }
        ],
        "vocabulary_level": "B1",
        "fluency_score": 8.0,
        "lesson_topic": "Travel & Past Tenses",
        "weak_topics": ["Past Simple vs Present Perfect"],
        "recommendations": ["Gap-fill practice"],
    },
    {
        "id": "demo-6",
        "lesson_id": "demo-lesson-6",
        "student_id": "demo",
        "lesson_date": "2026-05-19T14:00:00Z",
        "created_at": "2026-05-19T14:00:00Z",
        "grammar_errors": [],
        "vocabulary_level": "B1",
        "fluency_score": 7.5,
        "lesson_topic": "Conditionals",
        "weak_topics": ["Conditionals"],
        "recommendations": ["1st conditional drills"],
    },
    {
        "id": "demo-5",
        "lesson_id": "demo-lesson-5",
        "student_id": "demo",
        "lesson_date": "2026-05-12T14:00:00Z",
        "created_at": "2026-05-12T14:00:00Z",
        "grammar_errors": [],
        "vocabulary_level": "A2",
        "fluency_score": 7.0,
        "lesson_topic": "Past Simple",
        "weak_topics": ["Past Simple"],
        "recommendations": ["Irregular verbs"],
    },
]


def _json_default(obj):
    if isinstance(obj, date):
        return obj.isoformat()
    raise TypeError(type(obj))


def main() -> None:
    today = date(2026, 6, 1)
    tracking_view = error_pattern_service.build_error_tracking(DEMO_REPORTS)
    stuck_count = len(tracking_view.stuck_patterns)
    plan = goal_plan_service.compute_study_plan(
        DEMO_GOAL, DEMO_REPORTS, stuck_category_count=stuck_count, today=today
    )
    assert plan is not None

    period_start, period_end, _ = daily_progress_service.goal_period(DEMO_GOAL)
    sync_rows = daily_progress_service.build_daily_rows_for_sync(
        DEMO_GOAL, plan, DEMO_REPORTS, {}, today
    )
    tracker = daily_progress_service.build_tracker(DEMO_GOAL, plan, sync_rows, DEMO_REPORTS)

    error_payload = error_pattern_service.tracking_to_dict(tracking_view)
    latest = DEMO_REPORTS[0]
    error_payload["prioritized_weak_topics"] = error_pattern_service.build_prioritized_weak_topics(
        tracking_view, latest.get("weak_topics") or []
    )

    study_plan = goal_plan_service.study_plan_to_dict(plan)
    progress_tracker = (
        daily_progress_service.tracker_to_dict(tracker) if tracker else None
    )

    program_id = "special-negotiations"
    curriculum = build_curriculum(
        program_id, DEMO_REPORTS, progress_tracker
    )

    (FIXTURES / "study_plan.json").write_text(
        json.dumps(study_plan, ensure_ascii=False, indent=2, default=_json_default),
        encoding="utf-8",
    )
    (FIXTURES / "error_patterns.json").write_text(
        json.dumps(error_payload, ensure_ascii=False, indent=2, default=_json_default),
        encoding="utf-8",
    )
    (FIXTURES / "progress_tracker.json").write_text(
        json.dumps(progress_tracker, ensure_ascii=False, indent=2, default=_json_default),
        encoding="utf-8",
    )
    (FIXTURES / "curriculum.json").write_text(
        json.dumps(
            {"program_id": program_id, **(curriculum or {})},
            ensure_ascii=False,
            indent=2,
            default=_json_default,
        ),
        encoding="utf-8",
    )

    reports_bundle = {
        "student_id": "demo",
        "student_name": "Кристина Виговская",
        "student_email": "kristina.vigovska@gmail.com",
        "reports": DEMO_REPORTS,
        "study_plan": study_plan,
        "progress_tracker": progress_tracker,
        "error_tracking": error_payload,
        **{k: DEMO_GOAL.get(k) for k in (
            "target_cefr_level", "target_date", "goal_label", "goal_set_date",
            "goal_type", "target_duration_weeks", "scenario_description",
            "tutor_lessons_per_week", "tutor_lesson_minutes", "practice_days_per_week",
            "study_intensity_preset",
        )},
        "goal_start_cefr_level": DEMO_GOAL["goal_start_cefr_level"],
    }
    reports_bundle["target_cefr_level"] = DEMO_GOAL["target_cefr_level"]
    reports_bundle["target_date"] = DEMO_GOAL["target_date"]
    reports_bundle["goal_set_date"] = DEMO_GOAL["goal_set_date"]

    (FIXTURES / "reports.json").write_text(
        json.dumps(reports_bundle, ensure_ascii=False, indent=2, default=_json_default),
        encoding="utf-8",
    )
    print(f"Wrote fixtures to {FIXTURES}")

    static_dir = ROOT / "static"
    static_dir.mkdir(parents=True, exist_ok=True)
    from services import demo_state
    from services.app_config import get_public_config

    preview_bundle = demo_state.build_bundle()
    preview_bundle["curriculum"] = curriculum
    (static_dir / "demo-preview.json").write_text(
        json.dumps(preview_bundle, ensure_ascii=False, indent=2, default=_json_default),
        encoding="utf-8",
    )
    (static_dir / "demo-config.json").write_text(
        json.dumps(get_public_config(), ensure_ascii=False, indent=2, default=_json_default),
        encoding="utf-8",
    )
    from services.programs_catalog import read_catalog_json_file

    (static_dir / "demo-programs.json").write_text(
        json.dumps(
            {"programs": read_catalog_json_file()},
            ensure_ascii=False,
            indent=2,
            default=_json_default,
        ),
        encoding="utf-8",
    )
    print(f"Wrote static/demo-preview.json, demo-config.json, demo-programs.json")


if __name__ == "__main__":
    main()
