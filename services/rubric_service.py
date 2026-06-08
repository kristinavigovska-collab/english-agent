"""Load Yappi speaking rubrics and format them for Claude prompts."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

RUBRICS_DIR = Path(__file__).resolve().parent.parent / "docs" / "rubrics" / "speaking"

COURSE_LEVELS = frozenset(
    {
        "beginner",
        "elementary",
        "pre_intermediate",
        "intermediate",
        "upper_intermediate",
        "advanced",
    }
)

CATEGORY_ORDER = ("fluency", "accuracy", "coherency", "new_language_usage")


def normalize_course_level(course_level: str) -> str | None:
    if not course_level:
        return None
    normalized = course_level.strip().lower().replace("-", "_")
    return normalized if normalized in COURSE_LEVELS else None


@lru_cache(maxsize=len(COURSE_LEVELS))
def load_rubric(course_level: str) -> dict[str, Any] | None:
    level = normalize_course_level(course_level)
    if not level:
        return None
    path = RUBRICS_DIR / f"{level}.yaml"
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def format_rubric_prompt(rubric: dict[str, Any]) -> str:
    """Render one level's rubric as a Russian instruction block for Claude."""
    level_label = rubric.get("level_label_ru", rubric.get("level", ""))
    cefr_range = rubric.get("cefr_range", "")
    bands = rubric.get("scoring_scale", {}).get("bands", {})
    categories = rubric.get("categories", {})

    lines = [
        "## Speaking rubric (methodologist scale)",
        "",
        f"**Course level:** {level_label} ({cefr_range})",
        "",
        "**Scoring bands per category:** "
        + " · ".join(f"{score} — {label}" for score, label in sorted(bands.items(), reverse=True)),
        "",
        "Evaluate the student's speaking against the descriptors below. "
        "For each category, pick exactly one band: 5, 10, 15, 20, or 25.",
        "",
    ]

    for key in CATEGORY_ORDER:
        cat = categories.get(key)
        if not cat:
            continue
        lines.append(f"### {cat.get('label_ru', key)} ({cat.get('label_en', key)})")
        for score in (25, 20, 15, 10, 5):
            descriptor = cat.get("descriptors", {}).get(score)
            if descriptor:
                lines.append(f"- **{score}:** {descriptor.strip()}")
        lines.append("")

    agent_instructions = rubric.get("agent_instructions_ru")
    if agent_instructions:
        lines.extend(["**Rubric instructions:**", agent_instructions.strip(), ""])

    lines.extend(
        [
            "**Mapping to JSON output:**",
            "- `fluency_score` = fluency category band ÷ 2.5 (5→2.0, 10→4.0, 15→6.0, 20→8.0, 25→10.0).",
            "- `vocabulary_level` = best-matching CEFR label; anchor expectations to this course level.",
            "- Use accuracy, coherency, and new-language bands to inform `grammar_errors`, `weak_topics`, and `recommendations`.",
        ]
    )

    return "\n".join(lines)


def get_rubric_prompt(course_level: str) -> str | None:
    rubric = load_rubric(course_level)
    if not rubric:
        return None
    return format_rubric_prompt(rubric)
