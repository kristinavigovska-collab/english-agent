import os
from datetime import date, datetime
from typing import Any, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

from models.schemas import DrillSet, LessonAnalysis
from services.error_category_config import category_label

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


def _report_payload(
    student_id: str,
    lesson_id: str,
    analysis: LessonAnalysis,
    drill_set: Optional[DrillSet] = None,
) -> dict:
    payload: dict[str, Any] = {
        "student_id": student_id,
        "lesson_id": lesson_id,
        "grammar_errors": [e.model_dump() for e in analysis.grammar_errors],
        "vocabulary_level": analysis.vocabulary_level,
        "fluency_score": analysis.fluency_score,
        "weak_topics": analysis.weak_topics,
        "recommendations": analysis.recommendations,
    }
    if drill_set is not None:
        payload["drills"] = drill_set.model_dump()
    return payload


def save_report(
    student_id: str,
    lesson_id: str,
    analysis: LessonAnalysis,
    drill_set: Optional[DrillSet] = None,
) -> dict:
    db = get_supabase()
    result = (
        db.table("reports")
        .insert(_report_payload(student_id, lesson_id, analysis, drill_set))
        .execute()
    )
    return result.data[0]


def upsert_report_for_lesson(
    student_id: str,
    lesson_id: str,
    analysis: LessonAnalysis,
    drill_set: Optional[DrillSet] = None,
) -> dict:
    db = get_supabase()
    existing = (
        db.table("reports").select("id").eq("lesson_id", lesson_id).limit(1).execute()
    )
    payload = _report_payload(student_id, lesson_id, analysis, drill_set)
    if existing.data:
        result = (
            db.table("reports").update(payload).eq("lesson_id", lesson_id).execute()
        )
    else:
        result = db.table("reports").insert(payload).execute()
    return result.data[0]


def save_drill_result(
    student_id: str,
    report_id: str,
    drill_index: int,
    answer: str,
    is_correct: bool,
    hypothesis_id: Optional[str] = None,
) -> dict:
    db = get_supabase()
    result = (
        db.table("drill_results")
        .insert(
            {
                "student_id": student_id,
                "report_id": report_id,
                "hypothesis_id": hypothesis_id,
                "drill_index": drill_index,
                "answer": answer,
                "is_correct": is_correct,
            }
        )
        .execute()
    )
    return result.data[0]


def get_student(student_id: str) -> Optional[dict]:
    db = get_supabase()
    result = db.table("students").select("*").eq("id", student_id).execute()
    return result.data[0] if result.data else None


def update_student_goal(
    student_id: str,
    *,
    goal_text: str,
    target_duration_weeks: int,
    target_date: str,
    current_level_tag: Optional[str] = None,
    tutor_lessons_per_week: int = 2,
    tutor_lesson_minutes: int = 60,
    practice_days_per_week: int = 6,
    study_intensity_preset: Optional[str] = None,
) -> dict:
    db = get_supabase()
    payload = {
        "goal_text": goal_text,
        "current_level_tag": current_level_tag,
        "target_duration_weeks": target_duration_weeks,
        "target_date": target_date,
        "goal_set_date": date.today().isoformat(),
        "tutor_lessons_per_week": tutor_lessons_per_week,
        "tutor_lesson_minutes": tutor_lesson_minutes,
        "practice_days_per_week": practice_days_per_week,
        "study_intensity_preset": study_intensity_preset,
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


def mark_practice(
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
        "source": "practice",
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


def upsert_error_hypotheses(
    student_id: str,
    lesson_id: str,
    analysis: LessonAnalysis,
) -> None:
    """Group grammar errors by category and upsert into error_hypotheses."""
    db = get_supabase()

    groups: dict[str, list[dict]] = {}
    for e in analysis.grammar_errors:
        cat = e.error_category or "other"
        if cat not in groups:
            groups[cat] = []
        groups[cat].append(
            {
                "error": e.error,
                "correction": e.correction,
                "explanation": e.explanation,
                "lesson_id": lesson_id,
            }
        )

    if not groups:
        return

    existing_result = (
        db.table("error_hypotheses")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    existing_by_pattern = {r["pattern"]: r for r in (existing_result.data or [])}

    rows_to_upsert = []
    for pattern, new_examples in groups.items():
        existing = existing_by_pattern.get(pattern)
        if existing:
            old_examples = [
                ex for ex in (existing.get("examples") or [])
                if ex.get("lesson_id") != lesson_id
            ]
            merged = (old_examples + new_examples)[-30:]
            unique_lessons = len({ex.get("lesson_id") for ex in merged if ex.get("lesson_id")})
            status = existing.get("status", "observed")
            if status == "dismissed":
                status = "observed"
            rows_to_upsert.append(
                {
                    "id": existing["id"],
                    "student_id": student_id,
                    "pattern": pattern,
                    "pattern_label": category_label(pattern),
                    "examples": merged,
                    "occurrences": max(unique_lessons, 1),
                    "status": status,
                    "disputed_by_student": existing.get("disputed_by_student", False),
                    "updated_at": datetime.utcnow().isoformat(),
                }
            )
        else:
            rows_to_upsert.append(
                {
                    "student_id": student_id,
                    "pattern": pattern,
                    "pattern_label": category_label(pattern),
                    "examples": new_examples,
                    "occurrences": 1,
                    "status": "observed",
                    "disputed_by_student": False,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            )

    db.table("error_hypotheses").upsert(
        rows_to_upsert, on_conflict="student_id,pattern"
    ).execute()


def get_error_hypotheses(
    student_id: str,
    *,
    include_dismissed: bool = False,
) -> list[dict]:
    db = get_supabase()
    q = db.table("error_hypotheses").select("*").eq("student_id", student_id)
    if not include_dismissed:
        q = q.neq("status", "dismissed")
    result = q.order("occurrences", desc=True).execute()
    return result.data or []


def dismiss_hypothesis(hypothesis_id: str, student_id: str) -> dict:
    db = get_supabase()
    result = (
        db.table("error_hypotheses")
        .update(
            {
                "status": "dismissed",
                "disputed_by_student": True,
                "updated_at": datetime.utcnow().isoformat(),
            }
        )
        .eq("id", hypothesis_id)
        .eq("student_id", student_id)
        .execute()
    )
    if not result.data:
        raise RuntimeError(f"Hypothesis {hypothesis_id} not found")
    return result.data[0]


def upsert_error_pattern_history(student_id: str, rows: list[dict]) -> None:
    db = get_supabase()
    db.table("error_pattern_history").delete().eq("student_id", student_id).execute()
    if not rows:
        return
    payload = [{**row, "updated_at": datetime.utcnow().isoformat()} for row in rows]
    db.table("error_pattern_history").insert(payload).execute()
