import os
from datetime import date, datetime
from typing import Any, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

from models.schemas import LessonAnalysis

load_dotenv()

_supabase: Optional[Client] = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")
        _supabase = create_client(url, key)
    return _supabase


def get_or_create_student(name: str, email: str) -> dict:
    db = get_supabase()
    result = db.table("students").select("*").eq("email", email).execute()
    if result.data:
        return result.data[0]
    new_result = db.table("students").insert({"name": name, "email": email}).execute()
    return new_result.data[0]


def get_lesson_by_bot_id(recall_bot_id: str) -> Optional[dict]:
    db = get_supabase()
    result = (
        db.table("lessons")
        .select("*")
        .eq("recall_bot_id", recall_bot_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_or_create_lesson_for_bot(
    student_id: str,
    recall_bot_id: str,
    transcript: str = "",
    lesson_topic: Optional[str] = None,
) -> dict:
    existing = get_lesson_by_bot_id(recall_bot_id)
    if existing:
        if lesson_topic and not (existing.get("lesson_topic") or "").strip():
            return update_lesson_topic(existing["id"], lesson_topic)
        return existing
    return create_lesson(
        student_id,
        recall_bot_id,
        transcript,
        lesson_topic=lesson_topic,
    )


def update_lesson_transcript(lesson_id: str, transcript: str) -> dict:
    db = get_supabase()
    result = (
        db.table("lessons")
        .update({"transcript": transcript})
        .eq("id", lesson_id)
        .execute()
    )
    return result.data[0]


def update_lesson_topic(lesson_id: str, lesson_topic: str) -> dict:
    db = get_supabase()
    result = (
        db.table("lessons")
        .update({"lesson_topic": lesson_topic})
        .eq("id", lesson_id)
        .execute()
    )
    return result.data[0]


def create_lesson(
    student_id: str,
    meeting_id: str,
    transcript: str = "",
    lesson_topic: Optional[str] = None,
) -> dict:
    db = get_supabase()
    payload: dict[str, Any] = {
        "student_id": student_id,
        "recall_bot_id": meeting_id,
        "transcript": transcript,
    }
    if lesson_topic:
        payload["lesson_topic"] = lesson_topic
    result = db.table("lessons").insert(payload).execute()
    return result.data[0]


def _report_payload(student_id: str, lesson_id: str, analysis: LessonAnalysis) -> dict:
    return {
        "student_id": student_id,
        "lesson_id": lesson_id,
        "grammar_errors": [e.model_dump() for e in analysis.grammar_errors],
        "vocabulary_level": analysis.vocabulary_level,
        "fluency_score": analysis.fluency_score,
        "weak_topics": analysis.weak_topics,
        "recommendations": analysis.recommendations,
    }


def save_report(student_id: str, lesson_id: str, analysis: LessonAnalysis) -> dict:
    db = get_supabase()
    result = (
        db.table("reports")
        .insert(_report_payload(student_id, lesson_id, analysis))
        .execute()
    )
    return result.data[0]


def upsert_report_for_lesson(
    student_id: str, lesson_id: str, analysis: LessonAnalysis
) -> dict:
    db = get_supabase()
    existing = (
        db.table("reports").select("id").eq("lesson_id", lesson_id).limit(1).execute()
    )
    payload = _report_payload(student_id, lesson_id, analysis)
    if existing.data:
        result = (
            db.table("reports").update(payload).eq("lesson_id", lesson_id).execute()
        )
    else:
        result = db.table("reports").insert(payload).execute()
    return result.data[0]


def get_student(student_id: str) -> Optional[dict]:
    db = get_supabase()
    result = db.table("students").select("*").eq("id", student_id).execute()
    return result.data[0] if result.data else None


def update_student_goal(
    student_id: str,
    *,
    goal_type: str,
    target_cefr_level: str,
    target_duration_weeks: int,
    target_date: str,
    goal_start_cefr_level: str,
    scenario_description: Optional[str] = None,
    goal_label: Optional[str] = None,
    tutor_lessons_per_week: int = 2,
    tutor_lesson_minutes: int = 60,
    practice_days_per_week: int = 6,
) -> dict:
    db = get_supabase()
    payload = {
        "goal_type": goal_type,
        "target_cefr_level": target_cefr_level,
        "target_duration_weeks": target_duration_weeks,
        "target_date": target_date,
        "goal_start_cefr_level": goal_start_cefr_level,
        "scenario_description": scenario_description,
        "goal_label": goal_label,
        "goal_set_date": date.today().isoformat(),
        "tutor_lessons_per_week": tutor_lessons_per_week,
        "tutor_lesson_minutes": tutor_lesson_minutes,
        "practice_days_per_week": practice_days_per_week,
    }
    result = db.table("students").update(payload).eq("id", student_id).execute()
    if not result.data:
        raise RuntimeError(f"Student {student_id} not found")
    return result.data[0]


def get_student_reports(student_id: str) -> list[dict]:
    db = get_supabase()
    result = (
        db.table("reports")
        .select("*, lessons(recall_bot_id, created_at, lesson_topic)")
        .eq("student_id", student_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def get_daily_progress(student_id: str, start_date: str, end_date: str) -> list[dict]:
    db = get_supabase()
    result = (
        db.table("daily_progress")
        .select("*")
        .eq("student_id", student_id)
        .gte("progress_date", start_date)
        .lte("progress_date", end_date)
        .order("progress_date")
        .execute()
    )
    return result.data or []


def upsert_daily_progress(student_id: str, rows: list[dict]) -> None:
    if not rows:
        return
    db = get_supabase()
    payload = [
        {
            "student_id": student_id,
            "progress_date": row["progress_date"],
            "planned_minutes": row["planned_minutes"],
            "completed": row["completed"],
            "completed_minutes": row.get("completed_minutes"),
            "source": row.get("source"),
            "updated_at": datetime.utcnow().isoformat(),
        }
        for row in rows
    ]
    db.table("daily_progress").upsert(payload, on_conflict="student_id,progress_date").execute()


def mark_self_practice(
    student_id: str,
    progress_date: str,
    planned_minutes: int,
    completed_minutes: int,
) -> dict:
    db = get_supabase()
    payload = {
        "student_id": student_id,
        "progress_date": progress_date,
        "planned_minutes": planned_minutes,
        "completed": True,
        "completed_minutes": completed_minutes,
        "source": "self_practice",
        "updated_at": date.today().isoformat(),
    }
    result = (
        db.table("daily_progress")
        .upsert(payload, on_conflict="student_id,progress_date")
        .execute()
    )
    return result.data[0]


def clear_daily_progress(student_id: str) -> None:
    db = get_supabase()
    db.table("daily_progress").delete().eq("student_id", student_id).execute()


def upsert_error_pattern_history(student_id: str, rows: list[dict]) -> None:
    db = get_supabase()
    db.table("error_pattern_history").delete().eq("student_id", student_id).execute()
    if not rows:
        return
    payload = [{**row, "updated_at": datetime.utcnow().isoformat()} for row in rows]
    db.table("error_pattern_history").insert(payload).execute()
