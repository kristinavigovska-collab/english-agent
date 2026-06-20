from datetime import date

from services.error_pattern_config import STUCK_LESSONS_THRESHOLD
from services.error_pattern_service import build_error_tracking, build_prioritized_weak_topics


def _report(rid: str, created: str, errors: list[dict]) -> dict:
    return {
        "id": rid,
        "lesson_id": f"lesson-{rid}",
        "created_at": created,
        "grammar_errors": errors,
        "weak_topics": [],
    }


def test_stuck_third_person_after_three_lessons():
    reports = [
        _report(
            "1",
            "2026-01-01T10:00:00Z",
            [{"error": "He go", "correction": "He goes", "explanation": "3-го лица"}],
        ),
        _report(
            "2",
            "2026-01-08T10:00:00Z",
            [{"error": "She don't", "correction": "She doesn't", "explanation": "third person"}],
        ),
        _report(
            "3",
            "2026-01-15T10:00:00Z",
            [{"error": "It don't", "correction": "It doesn't", "explanation": "doesn't"}],
        ),
    ]
    view = build_error_tracking(reports)
    stuck = [p for p in view.patterns if p.error_category == "third_person_singular"]
    assert len(stuck) == 1
    assert stuck[0].status == "stuck"
    assert stuck[0].consecutive_lessons_count >= STUCK_LESSONS_THRESHOLD


def test_new_category_on_latest_lesson_only():
    reports = [
        _report(
            "1",
            "2026-01-01T10:00:00Z",
            [{"error": "I go yesterday", "correction": "I went", "explanation": "Past Simple"}],
        ),
        _report(
            "2",
            "2026-01-08T10:00:00Z",
            [{"error": "If I will", "correction": "If I have", "explanation": "conditional"}],
        ),
    ]
    view = build_error_tracking(reports)
    new_cats = {p.error_category for p in view.new_patterns}
    assert "conditionals" in new_cats


def test_prioritized_weak_topics_order():
    reports = [
        _report("1", "2026-01-01T10:00:00Z", []),
        _report("2", "2026-01-08T10:00:00Z", []),
        _report(
            "3",
            "2026-01-15T10:00:00Z",
            [{"error": "He go", "correction": "He goes", "explanation": "3-го лица"}],
        ),
    ]
    reports[0]["grammar_errors"] = [
        {"error": "He go", "correction": "He goes", "explanation": "3-го лица"}
    ]
    reports[1]["grammar_errors"] = [
        {"error": "She go", "correction": "She goes", "explanation": "third person"}
    ]
    view = build_error_tracking(reports)
    items = build_prioritized_weak_topics(view, ["Articles", "Phrasal verbs"])
    assert items[0]["priority"] == "stuck"
    assert "3-го лица" in items[0]["text"]
