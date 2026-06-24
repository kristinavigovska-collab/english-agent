"""Program catalog — Supabase `programs` table first, JSON file fallback."""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

CATALOG_JSON_PATH = Path(__file__).resolve().parent.parent / "data" / "programs_catalog.json"
_CATALOG_PATH = CATALOG_JSON_PATH

VALID_CATEGORIES = frozenset({"general", "business", "special"})


def program_row_to_api(row: dict[str, Any]) -> dict[str, Any]:
    """Map Supabase `programs` row to dashboard/API catalog shape."""
    program: dict[str, Any] = {
        "id": row["id"],
        "category": row["category"],
        "levelId": row["level_id"],
        "title": row["title"],
        "description": row["description"],
        "classes": row["classes_count"],
        "weeks": row["weeks_count"],
        "tags": row.get("tags") or [],
    }
    base_category = row.get("base_category")
    base_level_id = row.get("base_level_id")
    if base_category and base_level_id:
        program["base"] = {"category": base_category, "levelId": base_level_id}
    return program


def program_api_to_row(program: dict[str, Any], sort_order: int) -> dict[str, Any]:
    """Map catalog JSON / API shape to Supabase `programs` row."""
    base = program.get("base") or {}
    return {
        "id": program["id"],
        "category": program["category"],
        "level_id": program["levelId"],
        "title": program["title"],
        "description": program["description"],
        "classes_count": program["classes"],
        "weeks_count": program["weeks"],
        "tags": program.get("tags") or [],
        "base_category": base.get("category"),
        "base_level_id": base.get("levelId"),
        "sort_order": sort_order,
        "is_active": True,
    }


def validate_program_entry(entry: dict[str, Any], index: int) -> list[str]:
    errors: list[str] = []
    prefix = f"programs[{index}]"

    if not isinstance(entry, dict):
        return [f"{prefix}: expected object"]

    for key in ("id", "category", "levelId", "title", "description", "classes", "weeks", "tags"):
        if key not in entry:
            errors.append(f"{prefix}: missing '{key}'")

    category = entry.get("category")
    if category and category not in VALID_CATEGORIES:
        errors.append(f"{prefix}: invalid category '{category}'")

    for numeric in ("classes", "weeks"):
        value = entry.get(numeric)
        if value is not None and (not isinstance(value, int) or value < 1):
            errors.append(f"{prefix}: '{numeric}' must be a positive integer")

    tags = entry.get("tags")
    if tags is not None and not isinstance(tags, list):
        errors.append(f"{prefix}: 'tags' must be a list")

    base = entry.get("base")
    if base is not None:
        if not isinstance(base, dict):
            errors.append(f"{prefix}: 'base' must be an object")
        else:
            if not base.get("category") or not base.get("levelId"):
                errors.append(f"{prefix}: 'base' needs category and levelId")

    return errors


def validate_programs_catalog(catalog: list[Any]) -> list[str]:
    errors: list[str] = []
    if not isinstance(catalog, list):
        return ["catalog must be a JSON array"]

    seen_ids: set[str] = set()
    for index, entry in enumerate(catalog):
        errors.extend(validate_program_entry(entry, index))
        program_id = entry.get("id") if isinstance(entry, dict) else None
        if program_id:
            if program_id in seen_ids:
                errors.append(f"duplicate program id: {program_id}")
            seen_ids.add(program_id)

    return errors


def read_catalog_json_file(path: Path | None = None) -> list[dict[str, Any]]:
    """Load canonical catalog from JSON file."""
    catalog_path = path or CATALOG_JSON_PATH
    if not catalog_path.is_file():
        return []
    with catalog_path.open(encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def clear_programs_catalog_cache() -> None:
    _load_programs_catalog_json.cache_clear()


def load_programs_catalog_from_db() -> Optional[list[dict[str, Any]]]:
    try:
        from services.supabase_service import get_supabase

        db = get_supabase()
        result = (
            db.table("programs")
            .select("*")
            .eq("is_active", True)
            .order("sort_order")
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        return [program_row_to_api(row) for row in rows]
    except Exception as exc:
        logger.warning("Programs catalog DB load failed, using JSON fallback: %s", exc)
        return None


@lru_cache(maxsize=1)
def _load_programs_catalog_json() -> list[dict[str, Any]]:
    return read_catalog_json_file()


def load_programs_catalog() -> list[dict[str, Any]]:
    db_catalog = load_programs_catalog_from_db()
    if db_catalog:
        return db_catalog
    return _load_programs_catalog_json()


def get_program(program_id: str) -> Optional[dict[str, Any]]:
    for program in load_programs_catalog():
        if program.get("id") == program_id:
            return program
    return None
