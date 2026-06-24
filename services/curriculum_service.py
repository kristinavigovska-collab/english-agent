"""Server-side curriculum: class list + completion from reports and progress."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Optional

from services.programs_catalog import get_program


def _normalize_topic(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _class_titles(program: dict[str, Any]) -> list[str]:
    count = max(0, int(program.get("classes") or 0))
    tags = list(program.get("tags") or []) or ["Практика"]
    titles: list[str] = []
    for i in range(count):
        tag = tags[i % len(tags)]
        if count <= len(tags):
            titles.append(str(tag))
        else:
            module_num = i // len(tags) + 1
            titles.append(f"Модуль {module_num}: {tag}" if module_num > 1 else str(tag))
    return titles


def _report_date(report: dict) -> Optional[date]:
    raw = report.get("lesson_date") or report.get("created_at")
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, str):
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    return None


def _lesson_topic(report: dict) -> str:
    return str(report.get("lesson_topic") or "").strip()


def build_curriculum(
    program_id: str,
    reports: list[dict],
    progress_tracker: Optional[dict] = None,
    extra_completed_class_nums: Optional[set[int]] = None,
) -> Optional[dict[str, Any]]:
    program = get_program(program_id)
    if not program:
        return None

    titles = _class_titles(program)
    if not titles:
        return None

    completed_topics: dict[str, bool] = {}
    lesson_meta: dict[str, dict] = {}
    for report in reports:
        topic = _lesson_topic(report)
        if not topic or topic == "—":
            continue
        key = _normalize_topic(topic)
        completed_topics[key] = True
        lesson_date = _report_date(report)
        existing = lesson_meta.get(key)
        if not existing or (lesson_date and lesson_date > existing.get("date", date.min)):
            lesson_meta[key] = {
                "report_id": report.get("id"),
                "date": lesson_date,
            }

    self_practice_dates: list[date] = []
    if progress_tracker and progress_tracker.get("days"):
        for day in progress_tracker["days"]:
            if day.get("source") == "self_practice" and day.get("completed"):
                try:
                    self_practice_dates.append(date.fromisoformat(str(day["date"])[:10]))
                except ValueError:
                    pass
        self_practice_dates.sort()

    items: list[dict[str, Any]] = []
    used_practice: set[date] = set()

    for index, title in enumerate(titles):
        class_num = index + 1
        key = _normalize_topic(title)
        lesson_completed = bool(completed_topics.get(key))
        lesson_report_id = None
        lesson_date_iso = None
        self_study_completed = False

        if lesson_completed:
            meta = lesson_meta.get(key)
            if meta:
                lesson_report_id = meta.get("report_id")
                if meta.get("date"):
                    lesson_date_iso = meta["date"].isoformat()
            lesson_date = meta.get("date") if meta else None
            for practice_date in self_practice_dates:
                if practice_date in used_practice:
                    continue
                if lesson_date and practice_date >= lesson_date:
                    self_study_completed = True
                    used_practice.add(practice_date)
                    break

        if extra_completed_class_nums and class_num in extra_completed_class_nums:
            lesson_completed = True
            self_study_completed = True

        completed = lesson_completed and self_study_completed
        items.append(
            {
                "class_index": index,
                "class_num": class_num,
                "title": title,
                "program_id": program_id,
                "lesson_completed": lesson_completed,
                "self_study_completed": self_study_completed,
                "completed": completed,
                "is_current": False,
                "lesson_report_id": lesson_report_id,
                "lesson_date_iso": lesson_date_iso,
                "has_progress": lesson_completed or self_study_completed,
            }
        )

    # Sequential backfill: if class N has lesson, mark 1..N-1 done
    anchor = None
    for item in items:
        if item["lesson_completed"] and (anchor is None or item["class_num"] > anchor["class_num"]):
            anchor = item
    if anchor and anchor["class_num"] > 1:
        anchor_date = None
        if anchor.get("lesson_date_iso"):
            anchor_date = date.fromisoformat(anchor["lesson_date_iso"])
        for item in items:
            if item["class_num"] >= anchor["class_num"]:
                continue
            item["lesson_completed"] = True
            item["self_study_completed"] = True
            item["completed"] = True
            item["has_progress"] = True
            if not item.get("lesson_date_iso") and anchor_date:
                weeks_before = anchor["class_num"] - item["class_num"]
                back = anchor_date.fromordinal(anchor_date.toordinal() - weeks_before * 7)
                item["lesson_date_iso"] = back.isoformat()

    current_idx = -1
    for i, item in enumerate(items):
        if not item["lesson_completed"] or not item["self_study_completed"]:
            current_idx = i
            break
    if current_idx < 0 and items:
        current_idx = len(items) - 1
    for i, item in enumerate(items):
        item["is_current"] = i == current_idx

    completed_classes = [
        {
            "class_index": item["class_index"],
            "class_num": item["class_num"],
            "title": item["title"],
            "lesson_date": item.get("lesson_date_iso"),
        }
        for item in items
        if item["lesson_completed"]
    ]

    return {
        "program_id": program_id,
        "total_classes": len(items),
        "current_class_index": current_idx if current_idx >= 0 else 0,
        "completed_classes": completed_classes,
        "classes": items,
    }
