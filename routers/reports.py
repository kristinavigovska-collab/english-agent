from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from models.schemas import (
    MarkPracticeRequest,
    ProgressTrackerResponse,
    ReportResponse,
    StudentGoalUpdate,
    StudentReportsResponse,
    StudyPlanResponse,
)
from services import (
    daily_progress_service,
    goal_plan_service,
    supabase_service,
)

router = APIRouter()


def _student_goal_fields(student: dict) -> dict:
    return {
        "target_cefr_level": student.get("target_cefr_level"),
        "target_date": student.get("target_date"),
        "goal_label": student.get("goal_label"),
        "goal_set_date": student.get("goal_set_date"),
        "goal_type": student.get("goal_type"),
        "target_duration_weeks": student.get("target_duration_weeks"),
        "scenario_description": student.get("scenario_description"),
        "goal_start_cefr_level": student.get("goal_start_cefr_level"),
        "tutor_lessons_per_week": student.get("tutor_lessons_per_week"),
        "tutor_lesson_minutes": student.get("tutor_lesson_minutes"),
        "practice_days_per_week": student.get("practice_days_per_week"),
    }


def _report_models(rows: list[dict]) -> list[ReportResponse]:
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
    return reports


def _sync_and_build_goal_views(
    student: dict, report_rows: list[dict]
) -> tuple[Optional[StudyPlanResponse], Optional[ProgressTrackerResponse]]:
    base_plan = goal_plan_service.compute_study_plan(student, report_rows)
    if not base_plan:
        return None, None

    period_start, period_end, _ = daily_progress_service.goal_period(student)
    if not period_start or not period_end:
        return StudyPlanResponse(**goal_plan_service.study_plan_to_dict(base_plan)), None

    existing_rows = supabase_service.get_daily_progress(
        student["id"], period_start.isoformat(), period_end.isoformat()
    )
    existing_by_date = {
        daily_progress_service._parse_date(r.get("progress_date")): r
        for r in existing_rows
    }
    existing_by_date = {k: v for k, v in existing_by_date.items() if k is not None}

    sync_rows = daily_progress_service.build_daily_rows_for_sync(
        student, base_plan, report_rows, existing_by_date, date.today()
    )
    supabase_service.upsert_daily_progress(student["id"], sync_rows)

    stored_rows = supabase_service.get_daily_progress(
        student["id"], period_start.isoformat(), period_end.isoformat()
    )

    preliminary_tracker = daily_progress_service.build_tracker(
        student, base_plan, stored_rows, report_rows
    )
    completion_rate = None
    if preliminary_tracker:
        completion_rate = daily_progress_service.recent_completion_rate(
            preliminary_tracker.days, date.today()
        )

    adjusted_plan = goal_plan_service.compute_study_plan(
        student, report_rows, completion_rate=completion_rate
    )
    plan = adjusted_plan or base_plan

    tracker = daily_progress_service.build_tracker(
        student, plan, stored_rows, report_rows
    )
    if tracker and completion_rate is not None and completion_rate < 0.7:
        tracker.pace_warning = (
            f"Темп ниже плана — выполнено {int(completion_rate * 100)}% дней "
            f"за последние 14 дней. Необходимая нагрузка выросла до "
            f"{plan.hours_per_week} ч/нед"
        )

    study_plan_response = StudyPlanResponse(**goal_plan_service.study_plan_to_dict(plan))
    tracker_response = (
        ProgressTrackerResponse(**daily_progress_service.tracker_to_dict(tracker))
        if tracker
        else None
    )
    return study_plan_response, tracker_response


@router.get("/students/{student_id}/reports", response_model=StudentReportsResponse)
def get_student_reports(student_id: str):
    """Return all lesson reports for a student."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    rows = supabase_service.get_student_reports(student_id)
    reports = _report_models(rows)
    study_plan, progress_tracker = _sync_and_build_goal_views(student, rows)

    return StudentReportsResponse(
        student_id=student["id"],
        student_name=student["name"],
        student_email=student["email"],
        reports=reports,
        study_plan=study_plan,
        progress_tracker=progress_tracker,
        **_student_goal_fields(student),
    )


@router.patch("/students/{student_id}/goal", response_model=StudentReportsResponse)
def update_student_goal(student_id: str, body: StudentGoalUpdate):
    """Set or update the student's learning goal and duration-based plan."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    rows = supabase_service.get_student_reports(student_id)
    current_cefr = None
    if rows:
        latest = max(
            rows,
            key=lambda r: r.get("created_at") or "",
        )
        current_cefr = latest.get("vocabulary_level")

    if not current_cefr:
        raise HTTPException(
            status_code=400,
            detail="Cannot set a goal without at least one lesson report",
        )

    goal_set = date.today()
    target_date = body.target_date
    if target_date is None:
        target_date = goal_set + timedelta(weeks=body.target_duration_weeks)
    elif target_date <= goal_set:
        raise HTTPException(status_code=400, detail="target_date must be in the future")

    scenario_text = body.scenario_description or body.goal_label

    try:
        supabase_service.clear_daily_progress(student_id)
        supabase_service.update_student_goal(
            student_id=student_id,
            goal_type=body.goal_type,
            target_cefr_level=body.target_cefr_level,
            target_duration_weeks=body.target_duration_weeks,
            target_date=target_date.isoformat(),
            goal_start_cefr_level=current_cefr,
            scenario_description=scenario_text if body.goal_type == "scenario_based" else None,
            goal_label=body.goal_label or scenario_text,
            tutor_lessons_per_week=body.tutor_lessons_per_week,
            tutor_lesson_minutes=body.tutor_lesson_minutes,
            practice_days_per_week=body.practice_days_per_week,
        )
    except RuntimeError:
        raise HTTPException(status_code=404, detail="Student not found")

    return get_student_reports(student_id)


@router.post("/students/{student_id}/practice", response_model=StudentReportsResponse)
def mark_practice(student_id: str, body: MarkPracticeRequest):
    """Mark self-study practice for a day (defaults to today)."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    practice_date = body.progress_date or date.today()
    period_start, period_end, _ = daily_progress_service.goal_period(student)
    if not period_start or not period_end:
        raise HTTPException(status_code=400, detail="No active goal period")
    if practice_date < period_start or practice_date > period_end:
        raise HTTPException(status_code=400, detail="Date outside goal period")
    if practice_date > date.today():
        raise HTTPException(status_code=400, detail="Cannot mark future days")

    rows = supabase_service.get_student_reports(student_id)
    lesson_map = daily_progress_service.lesson_dates(rows, period_start, period_end)
    if practice_date in lesson_map:
        raise HTTPException(
            status_code=400,
            detail="This day is already covered by a tutor lesson",
        )

    base_plan = goal_plan_service.compute_study_plan(student, rows)
    if not base_plan:
        raise HTTPException(status_code=400, detail="Cannot compute study plan")

    planned = int(base_plan.minutes_per_day)
    completed_minutes = body.completed_minutes or planned

    existing = supabase_service.get_daily_progress(
        student_id, practice_date.isoformat(), practice_date.isoformat()
    )
    if existing and existing[0].get("source") == "lesson":
        raise HTTPException(status_code=400, detail="Day already completed via lesson")

    supabase_service.mark_self_practice(
        student_id,
        practice_date.isoformat(),
        planned_minutes=planned,
        completed_minutes=completed_minutes,
    )

    return get_student_reports(student_id)


@router.get("/dashboard/{student_id}", response_class=HTMLResponse)
def student_dashboard(student_id: str):
    """Serve the student progress dashboard."""
    with open("static/dashboard.html", encoding="utf-8") as f:
        html = f.read()
    html = html.replace("__STUDENT_ID__", student_id)
    return HTMLResponse(
        content=html,
        headers={"Cache-Control": "no-cache"},
    )
