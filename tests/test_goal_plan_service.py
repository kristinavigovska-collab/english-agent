from datetime import date

from services.goal_plan_service import compute_study_plan


def test_compute_study_plan_general_level():
    student = {
        "target_cefr_level": "B2",
        "goal_type": "general_level",
        "goal_set_date": "2026-01-01",
        "target_duration_weeks": 20,
        "goal_start_cefr_level": "B1",
        "tutor_lessons_per_week": 2,
        "tutor_lesson_minutes": 60,
        "practice_days_per_week": 6,
    }
    reports = [
        {
            "vocabulary_level": "B1",
            "fluency_score": 6.0,
            "lesson_date": "2026-01-01T10:00:00Z",
            "created_at": "2026-01-01T10:00:00Z",
        },
        {
            "vocabulary_level": "B1",
            "fluency_score": 7.0,
            "lesson_date": "2026-02-01T10:00:00Z",
            "created_at": "2026-02-01T10:00:00Z",
        },
    ]

    plan = compute_study_plan(student, reports, today=date(2026, 2, 15))
    assert plan is not None
    assert plan.weeks_total == 20
    assert plan.hours_per_week > 0
    assert plan.tutor_hours_per_week == 2.0
    assert plan.status in {"on_track", "behind", "ahead"}


def test_scenario_based_uses_lower_coefficient():
    student = {
        "target_cefr_level": "B2",
        "goal_type": "scenario_based",
        "goal_set_date": "2026-01-01",
        "target_duration_weeks": 10,
        "goal_start_cefr_level": "B1",
        "scenario_description": "job interview",
        "tutor_lessons_per_week": 2,
        "tutor_lesson_minutes": 60,
    }
    reports = [
        {
            "vocabulary_level": "B1",
            "fluency_score": 6.0,
            "created_at": "2026-01-01T10:00:00Z",
        }
    ]

    general = compute_study_plan(
        {**student, "goal_type": "general_level"}, reports, today=date(2026, 1, 15)
    )
    scenario = compute_study_plan(student, reports, today=date(2026, 1, 15))
    assert general is not None and scenario is not None
    assert scenario.total_hours < general.total_hours
