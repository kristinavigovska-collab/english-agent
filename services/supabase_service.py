import os
from typing import Optional

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


def create_lesson(student_id: str, meeting_id: str, transcript: str) -> dict:
    db = get_supabase()
    result = (
        db.table("lessons")
        .insert(
            {
                "student_id": student_id,
                "recall_bot_id": meeting_id,
                "transcript": transcript,
            }
        )
        .execute()
    )
    return result.data[0]


def save_report(student_id: str, lesson_id: str, analysis: LessonAnalysis) -> dict:
    db = get_supabase()
    result = (
        db.table("reports")
        .insert(
            {
                "student_id": student_id,
                "lesson_id": lesson_id,
                "grammar_errors": [e.model_dump() for e in analysis.grammar_errors],
                "vocabulary_level": analysis.vocabulary_level,
                "fluency_score": analysis.fluency_score,
                "weak_topics": analysis.weak_topics,
                "recommendations": analysis.recommendations,
            }
        )
        .execute()
    )
    return result.data[0]


def get_student(student_id: str) -> Optional[dict]:
    db = get_supabase()
    result = db.table("students").select("*").eq("id", student_id).execute()
    return result.data[0] if result.data else None


def get_student_reports(student_id: str) -> list[dict]:
    db = get_supabase()
    result = (
        db.table("reports")
        .select("*, lessons(recall_bot_id, created_at)")
        .eq("student_id", student_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data
