from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from models.schemas import StudentGoalUpdate, StudentReportsResponse, ReportResponse
from services import supabase_service

router = APIRouter()


def _student_goal_fields(student: dict) -> dict:
    return {
        "target_cefr_level": student.get("target_cefr_level"),
        "target_date": student.get("target_date"),
        "goal_label": student.get("goal_label"),
        "goal_set_date": student.get("goal_set_date"),
    }


@router.get("/students/{student_id}/reports", response_model=StudentReportsResponse)
def get_student_reports(student_id: str):
    """Return all lesson reports for a student."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    rows = supabase_service.get_student_reports(student_id)

    reports = []
    for row in rows:
        lesson_data = row.get("lessons") or {}
        reports.append(
            ReportResponse(
                id=row["id"],
                lesson_id=row["lesson_id"],
                student_id=row["student_id"],
                grammar_errors=row.get("grammar_errors") or [],
                vocabulary_level=row.get("vocabulary_level") or "",
                fluency_score=row.get("fluency_score") or 0.0,
                weak_topics=row.get("weak_topics") or [],
                recommendations=row.get("recommendations") or [],
                created_at=row.get("created_at"),
                meeting_id=lesson_data.get("recall_bot_id"),
                lesson_date=lesson_data.get("created_at"),
            )
        )

    return StudentReportsResponse(
        student_id=student["id"],
        student_name=student["name"],
        student_email=student["email"],
        reports=reports,
        **_student_goal_fields(student),
    )


@router.patch("/students/{student_id}/goal", response_model=StudentReportsResponse)
def update_student_goal(student_id: str, body: StudentGoalUpdate):
    """Set or update the student's learning goal."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        supabase_service.update_student_goal(
            student_id=student_id,
            target_cefr_level=body.target_cefr_level,
            target_date=body.target_date.isoformat(),
            goal_label=body.goal_label,
        )
    except RuntimeError:
        raise HTTPException(status_code=404, detail="Student not found")

    return get_student_reports(student_id)


@router.get("/dashboard/{student_id}", response_class=HTMLResponse)
def student_dashboard(student_id: str):
    """Serve the student progress dashboard."""
    with open("static/dashboard.html", encoding="utf-8") as f:
        html = f.read()
    # Inject the student_id into the page
    html = html.replace("__STUDENT_ID__", student_id)
    return HTMLResponse(
        content=html,
        headers={"Cache-Control": "no-cache"},
    )
