"""Cross-lesson grammar error pattern tracking — stuck / new / resolved."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Literal, Optional

from services.error_category_config import (
    category_label,
    infer_category_from_text,
    normalize_category,
)
from services.error_pattern_config import (
    RESOLVED_ABSENCE_LESSONS,
    STUCK_LESSONS_THRESHOLD,
)

PatternStatus = Literal["stuck", "new", "resolved", "recurring", "inactive"]


@dataclass
class CategoryOccurrence:
    lesson_id: str
    report_id: str
    date: date
    count_in_lesson: int


@dataclass
class ErrorPattern:
    error_category: str
    label: str
    occurrences: list[CategoryOccurrence]
    first_seen_date: date
    last_seen_date: date
    total_occurrences: int
    consecutive_lessons_count: int
    max_consecutive_lessons: int
    status: PatternStatus
    resolved_date: Optional[date]
    was_stuck: bool


@dataclass
class ErrorTrackingView:
    patterns: list[ErrorPattern]
    stuck_patterns: list[ErrorPattern]
    new_patterns: list[ErrorPattern]
    grammar_annotations: dict[str, dict[str, Any]]  # report_id → enriched errors


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
    lesson_data = report.get("lessons") or {}
    raw = report.get("lesson_date") or lesson_data.get("created_at") or report.get("created_at")
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, str):
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    return None


def _sorted_reports(reports: list[dict]) -> list[dict]:
    return sorted(reports, key=lambda r: _report_date(r) or date.min)


def error_category_for_item(item: dict) -> str:
    raw = item.get("error_category")
    if raw:
        return normalize_category(raw)
    return infer_category_from_text(
        item.get("error") or "",
        item.get("correction") or "",
        item.get("explanation") or "",
    )


def categories_in_report(report: dict) -> dict[str, int]:
    """Category → count in this lesson."""
    counts: dict[str, int] = {}
    for item in report.get("grammar_errors") or []:
        cat = error_category_for_item(item)
        counts[cat] = counts.get(cat, 0) + 1
    return counts


def _max_consecutive_streak(present_flags: list[bool]) -> int:
    best = 0
    current = 0
    for flag in present_flags:
        if flag:
            current += 1
            best = max(best, current)
        else:
            current = 0
    return best


def _consecutive_at_end(present_flags: list[bool]) -> int:
    count = 0
    for flag in reversed(present_flags):
        if flag:
            count += 1
        else:
            break
    return count


def _absent_from_last_n(present_flags: list[bool], n: int) -> bool:
    if len(present_flags) < n:
        return False
    return not any(present_flags[-n:])


def _classify_status(
    *,
    present_flags: list[bool],
    consecutive: int,
    max_streak: int,
    first_lesson_index: int,
    num_lessons: int,
) -> PatternStatus:
    if not num_lessons or not any(present_flags):
        return "inactive"

    was_stuck = max_streak >= STUCK_LESSONS_THRESHOLD
    latest_index = num_lessons - 1
    is_new = first_lesson_index == latest_index and present_flags[-1]

    if consecutive >= STUCK_LESSONS_THRESHOLD:
        return "stuck"
    if is_new:
        return "new"
    if was_stuck and consecutive == 0 and _absent_from_last_n(
        present_flags, RESOLVED_ABSENCE_LESSONS
    ):
        return "resolved"
    if present_flags[-1] or consecutive > 0:
        return "recurring"
    return "inactive"


def build_error_tracking(reports: list[dict]) -> ErrorTrackingView:
    sorted_reports = _sorted_reports(reports)
    if not sorted_reports:
        return ErrorTrackingView([], [], [], {})

    lesson_ids = [r["id"] for r in sorted_reports]
    category_occurrences: dict[str, list[CategoryOccurrence]] = {}

    for report in sorted_reports:
        report_date = _report_date(report) or date.today()
        for cat, count in categories_in_report(report).items():
            category_occurrences.setdefault(cat, []).append(
                CategoryOccurrence(
                    lesson_id=report["lesson_id"],
                    report_id=report["id"],
                    date=report_date,
                    count_in_lesson=count,
                )
            )

    patterns: list[ErrorPattern] = []

    for cat, occs in category_occurrences.items():
        present_flags = [
            cat in categories_in_report(r) for r in sorted_reports
        ]
        consecutive = _consecutive_at_end(present_flags)
        max_streak = _max_consecutive_streak(present_flags)
        first_idx = next(i for i, f in enumerate(present_flags) if f)
        was_stuck = max_streak >= STUCK_LESSONS_THRESHOLD
        status = _classify_status(
            present_flags=present_flags,
            consecutive=consecutive,
            max_streak=max_streak,
            first_lesson_index=first_idx,
            num_lessons=len(sorted_reports),
        )

        resolved_date: Optional[date] = None
        if status == "resolved":
            resolved_date = _report_date(sorted_reports[-1])

        total = sum(o.count_in_lesson for o in occs)
        patterns.append(
            ErrorPattern(
                error_category=cat,
                label=category_label(cat),
                occurrences=occs,
                first_seen_date=occs[0].date,
                last_seen_date=occs[-1].date,
                total_occurrences=total,
                consecutive_lessons_count=consecutive,
                max_consecutive_lessons=max_streak,
                status=status,
                resolved_date=resolved_date,
                was_stuck=was_stuck,
            )
        )

    status_rank = {"stuck": 0, "new": 1, "recurring": 2, "resolved": 3, "inactive": 4}
    patterns.sort(
        key=lambda p: (
            status_rank.get(p.status, 9),
            -p.consecutive_lessons_count,
            -p.total_occurrences,
        )
    )

    stuck = [p for p in patterns if p.status == "stuck"]
    new = [p for p in patterns if p.status == "new"]

    pattern_by_cat = {p.error_category: p for p in patterns}
    grammar_annotations: dict[str, dict[str, Any]] = {}

    for report in sorted_reports:
        enriched = []
        for item in report.get("grammar_errors") or []:
            cat = error_category_for_item(item)
            pat = pattern_by_cat.get(cat)
            row = dict(item)
            row["error_category"] = cat
            row["category_label"] = category_label(cat)
            if pat:
                row["pattern_status"] = pat.status
                row["consecutive_lessons_count"] = pat.consecutive_lessons_count
            else:
                row["pattern_status"] = "inactive"
                row["consecutive_lessons_count"] = 0
            enriched.append(row)
        grammar_annotations[report["id"]] = enriched

    return ErrorTrackingView(
        patterns=patterns,
        stuck_patterns=stuck,
        new_patterns=new,
        grammar_annotations=grammar_annotations,
    )


def stuck_category_count(reports: list[dict]) -> int:
    return len(build_error_tracking(reports).stuck_patterns)


def pattern_to_dict(p: ErrorPattern) -> dict:
    return {
        "error_category": p.error_category,
        "label": p.label,
        "occurrences": [
            {
                "lesson_id": o.lesson_id,
                "report_id": o.report_id,
                "date": o.date.isoformat(),
                "count_in_lesson": o.count_in_lesson,
            }
            for o in p.occurrences
        ],
        "first_seen_date": p.first_seen_date.isoformat(),
        "last_seen_date": p.last_seen_date.isoformat(),
        "total_occurrences": p.total_occurrences,
        "consecutive_lessons_count": p.consecutive_lessons_count,
        "max_consecutive_lessons": p.max_consecutive_lessons,
        "status": p.status,
        "resolved_date": p.resolved_date.isoformat() if p.resolved_date else None,
        "was_stuck": p.was_stuck,
    }


def _lesson_word(count: int) -> str:
    n = abs(count) % 100
    last = n % 10
    if last == 1 and n != 11:
        return "урок"
    if 2 <= last <= 4 and (n < 10 or n >= 20):
        return "урока"
    return "уроков"


def tracking_to_dict(view: ErrorTrackingView) -> dict:
    stuck_top = view.stuck_patterns[:3]

    def stuck_message(p: ErrorPattern) -> str:
        n = p.consecutive_lessons_count
        return (
            f"{p.label} — повторяется {n} {_lesson_word(n)} подряд, "
            f"стоит закрепить отдельно"
        )

    return {
        "patterns": [pattern_to_dict(p) for p in view.patterns],
        "stuck_patterns": [pattern_to_dict(p) for p in view.stuck_patterns],
        "new_patterns": [pattern_to_dict(p) for p in view.new_patterns],
        "stuck_topics": [
            {
                "error_category": p.error_category,
                "label": p.label,
                "consecutive_lessons_count": p.consecutive_lessons_count,
                "message": stuck_message(p),
            }
            for p in stuck_top
        ],
    }


def build_prioritized_weak_topics(
    view: ErrorTrackingView,
    weak_topics: list[str],
) -> list[dict]:
    """Stuck categories first, then new, then remaining weak_topics."""
    items: list[dict] = []
    seen: set[str] = set()

    for p in view.stuck_patterns:
        items.append(
            {
                "text": p.label,
                "priority": "stuck",
                "consecutive_lessons_count": p.consecutive_lessons_count,
            }
        )
        seen.add(p.label.lower())

    for p in view.new_patterns:
        if p.label.lower() not in seen:
            items.append({"text": p.label, "priority": "new", "consecutive_lessons_count": 0})
            seen.add(p.label.lower())

    for topic in weak_topics or []:
        key = topic.strip().lower()
        if key and key not in seen:
            items.append({"text": topic, "priority": "normal", "consecutive_lessons_count": 0})
            seen.add(key)

    return items


def patterns_for_db_sync(view: ErrorTrackingView, student_id: str) -> list[dict]:
    rows = []
    for p in view.patterns:
        rows.append(
            {
                "student_id": student_id,
                "error_category": p.error_category,
                "occurrences": [
                    {
                        "lesson_id": o.lesson_id,
                        "report_id": o.report_id,
                        "date": o.date.isoformat(),
                        "count_in_lesson": o.count_in_lesson,
                    }
                    for o in p.occurrences
                ],
                "first_seen_date": p.first_seen_date.isoformat(),
                "last_seen_date": p.last_seen_date.isoformat(),
                "total_occurrences": p.total_occurrences,
                "consecutive_lessons_count": p.consecutive_lessons_count,
                "max_consecutive_lessons": p.max_consecutive_lessons,
                "was_stuck": p.was_stuck,
                "resolved_date": p.resolved_date.isoformat() if p.resolved_date else None,
                "status": p.status,
            }
        )
    return rows
