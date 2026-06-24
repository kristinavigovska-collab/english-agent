"""Student program enrollment — Supabase `student_enrollments` (migration 007)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from services.programs_catalog import get_program

VALID_PLAN_IDS = frozenset(
    {"free_trial", "solo", "light", "standard", "intensive"}
)
ACTIVE_STATUSES = frozenset({"active", "trial"})

PROGRAM_LEVEL_META: dict[str, dict[str, str]] = {
    "beginner": {"label": "Beginner", "cefr": "A1"},
    "elementary": {"label": "Elementary", "cefr": "A2"},
    "pre_intermediate": {"label": "Pre-Intermediate", "cefr": "A2–B1"},
    "intermediate": {"label": "Intermediate", "cefr": "B1"},
    "upper_intermediate": {"label": "Upper-Intermediate", "cefr": "B2"},
    "advanced": {"label": "Advanced", "cefr": "C1"},
}


def enrollment_row_to_api(row: dict[str, Any], program: dict[str, Any]) -> dict[str, Any]:
    """Shape stored enrollment + catalog program for dashboard / API consumers."""
    level_id = program["levelId"]
    level_meta = PROGRAM_LEVEL_META.get(level_id, {})
    enrolled_at = row.get("started_at") or row.get("created_at")

    return {
        "program_id": row["program_id"],
        "plan_id": row["plan_id"],
        "status": row["status"],
        "level_id": level_id,
        "level_cefr": level_meta.get("cefr"),
        "level_name": level_meta.get("label"),
        "program_name": program.get("title"),
        "track_category": program.get("category"),
        "enrolled_at": enrolled_at,
        "student_confirmed": True,
    }


def _get_db():
    from services.supabase_service import get_supabase

    return get_supabase()


def _plan_exists(plan_id: str) -> bool:
    db = _get_db()
    result = db.table("program_plans").select("id").eq("id", plan_id).limit(1).execute()
    return bool(result.data)


def get_student_enrollment(student_id: str) -> Optional[dict[str, Any]]:
    db = _get_db()
    result = (
        db.table("student_enrollments")
        .select("*")
        .eq("student_id", student_id)
        .in_("status", list(ACTIVE_STATUSES))
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None

    row = result.data[0]
    program = get_program(row["program_id"])
    if not program:
        return None
    return enrollment_row_to_api(row, program)


def set_student_enrollment(
    student_id: str,
    *,
    program_id: str,
    plan_id: str,
    status: str = "active",
) -> dict[str, Any]:
    if plan_id not in VALID_PLAN_IDS:
        raise ValueError(f"Unknown plan_id: {plan_id}")
    if status not in ACTIVE_STATUSES and status not in {"paused", "cancelled", "expired"}:
        raise ValueError(f"Invalid status: {status}")
    if status not in ACTIVE_STATUSES:
        raise ValueError("Only active or trial enrollments can be created via API")

    program = get_program(program_id)
    if not program:
        raise ValueError(f"Unknown program_id: {program_id}")
    if not _plan_exists(plan_id):
        raise ValueError(f"Unknown plan_id: {plan_id}")

    db = _get_db()
    db.table("student_enrollments").update({"status": "cancelled"}).eq(
        "student_id", student_id
    ).in_("status", list(ACTIVE_STATUSES)).execute()

    insert_result = (
        db.table("student_enrollments")
        .insert(
            {
                "student_id": student_id,
                "program_id": program_id,
                "plan_id": plan_id,
                "status": status,
            }
        )
        .execute()
    )
    if not insert_result.data:
        raise RuntimeError("Failed to create enrollment")

    return enrollment_row_to_api(insert_result.data[0], program)


def clear_student_enrollment(student_id: str) -> None:
    db = _get_db()
    db.table("student_enrollments").update({"status": "cancelled"}).eq(
        "student_id", student_id
    ).in_("status", list(ACTIVE_STATUSES)).execute()
