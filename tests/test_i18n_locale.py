"""Locale dictionary completeness — mirrors scripts/check_i18n_keys.js."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCALE_PATH = ROOT / "static" / "locales" / "ru.json"
SCAN_FILES = [
    ROOT / "static" / "dashboard.js",
    ROOT / "static" / "dashboard.html",
    ROOT / "static" / "curriculum-stages.js",
    ROOT / "static" / "i18n.js",
]

KEY_RE = re.compile(
    r"""\bt\(\s*["']([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)["']"""
    r"""|data-i18n(?:-aria)?=["']([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)["']""",
    re.IGNORECASE,
)


def flatten_keys(obj: dict, prefix: str = "") -> set[str]:
    out: set[str] = set()
    for key, val in (obj or {}).items():
        full = f"{prefix}.{key}" if prefix else key
        if isinstance(val, dict):
            out |= flatten_keys(val, full)
        else:
            out.add(full)
    return out


def lookup(dict_obj: dict, key: str):
    if key in dict_obj and not isinstance(dict_obj[key], dict):
        return dict_obj[key]
    cur = dict_obj
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    if isinstance(cur, dict):
        return None
    return cur


def extract_keys(text: str) -> set[str]:
    keys: set[str] = set()
    for match in KEY_RE.finditer(text):
        keys.add(match.group(1) or match.group(2))
    return keys


def test_all_used_i18n_keys_exist_in_ru_locale():
    dict_obj = json.loads(LOCALE_PATH.read_text(encoding="utf-8"))
    used: set[str] = set()
    for path in SCAN_FILES:
        if path.exists():
            used |= extract_keys(path.read_text(encoding="utf-8"))

    missing = sorted(k for k in used if lookup(dict_obj, k) is None)
    assert not missing, f"Missing keys in locales/ru.json: {missing}"


def test_canonical_ru_keys_present():
    """Approved copy-layer keys from the ru locale brief must exist."""
    dict_obj = json.loads(LOCALE_PATH.read_text(encoding="utf-8"))
    required = [
        "program.title",
        "program.modules_few",
        "program.modules_many",
        "program.lessons_completed",
        "program.module",
        "program.module_current",
        "program.classes_range",
        "program.open_module",
        "program.open_modules_two",
        "lesson.report",
        "lesson.repeat_practice",
        "lesson.book_class",
        "lesson.archive",
        "lesson.goal_todo",
        "lesson.report_title_previous",
        "lesson.practice_done",
        "teacher.your_teacher",
        "teacher.leads_from_module",
        "teacher.after_lesson",
        "next_lesson.title",
        "next_lesson.not_scheduled",
        "next_lesson.book",
        "report.ai_report",
        "report.goal_progress",
        "report.goal_progress_empty",
        "report.next_step",
        "report.summary",
        "report.strengths",
        "report.focus",
        "report.practice",
        "report.plan",
        "report.plan_topics",
        "report.plan_recs",
        "report.first_time",
        "report.fluency",
        "report.vocabulary",
        "report.grammar",
        "report.words_per_min",
        "notify.module_done",
        "notify.module_done_cta",
        "practice_widget.consolidate",
        "practice_widget.choose_correct",
    ]
    missing = [k for k in required if lookup(dict_obj, k) is None]
    assert not missing, f"Canonical keys missing: {missing}"

    assert lookup(dict_obj, "lesson.repeat_practice") == "Повторить практику"
    assert lookup(dict_obj, "report.ai_report") == "Разбор урока"
    assert lookup(dict_obj, "program.module_current") == "текущий"
