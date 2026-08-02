from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from models.schemas import (
    DrillResultRequest,
    DrillSet,
    ErrorHypothesisResponse,
    ErrorTrackingResponse,
    HypothesisExample,
    MarkPracticeRequest,
    PrioritizedTopicResponse,
    ProgressTrackerResponse,
    ReportResponse,
    StudentGoalUpdate,
    StudentReportsResponse,
    StudyPlanResponse,
)
from services import (
    daily_progress_service,
    error_pattern_service,
    goal_plan_service,
    supabase_service,
)
from services.app_config import CEFR_LEVELS
from services.curriculum_service import build_curriculum
from services.intensity_config import INTENSITY_PRESETS, normalize_intensity_preset

router = APIRouter()


def _next_cefr_level(current: str) -> Optional[str]:
    normalized = (current or "").upper()
    try:
        idx = CEFR_LEVELS.index(normalized)
    except ValueError:
        return None
    if idx >= len(CEFR_LEVELS) - 1:
        return None
    return CEFR_LEVELS[idx + 1]


def _student_goal_fields(student: dict) -> dict:
    return {
        "goal_text": student.get("goal_text"),
        "current_level_tag": student.get("current_level_tag"),
        "target_date": student.get("target_date"),
        "goal_set_date": student.get("goal_set_date"),
        "target_duration_weeks": student.get("target_duration_weeks"),
        "tutor_lessons_per_week": student.get("tutor_lessons_per_week"),
        "tutor_lesson_minutes": student.get("tutor_lesson_minutes"),
        "practice_days_per_week": student.get("practice_days_per_week"),
        "study_intensity_preset": student.get("study_intensity_preset"),
        # legacy fields kept for backward compat
        "target_cefr_level": student.get("target_cefr_level"),
        "goal_label": student.get("goal_label"),
        "goal_type": student.get("goal_type"),
        "scenario_description": student.get("scenario_description"),
        "goal_start_cefr_level": student.get("goal_start_cefr_level"),
    }


def _report_models(
    rows: list[dict],
    tracking: error_pattern_service.ErrorTrackingView,
) -> list[ReportResponse]:
    latest_id = None
    if rows:
        sorted_rows = sorted(
            rows,
            key=lambda r: r.get("created_at") or "",
            reverse=True,
        )
        latest_id = sorted_rows[0]["id"]

    reports = []
    for row in rows:
        lesson_data = row.get("lessons") or {}
        grammar = tracking.grammar_annotations.get(row["id"]) or row.get(
            "grammar_errors"
        ) or []
        report_prioritized = (
            error_pattern_service.build_prioritized_weak_topics(
                tracking, row.get("weak_topics") or []
            )
            if row["id"] == latest_id
            else []
        )
        raw_drills = row.get("drills")
        drill_set = DrillSet(**raw_drills) if isinstance(raw_drills, dict) else None
        reports.append(
            ReportResponse(
                id=row["id"],
                lesson_id=row["lesson_id"],
                student_id=row["student_id"],
                grammar_errors=grammar,
                vocabulary_level=row.get("vocabulary_level") or "",
                fluency_score=row.get("fluency_score") or 0.0,
                weak_topics=row.get("weak_topics") or [],
                recommendations=row.get("recommendations") or [],
                created_at=row.get("created_at"),
                meeting_id=lesson_data.get("recall_bot_id"),
                lesson_date=lesson_data.get("created_at"),
                lesson_topic=lesson_data.get("lesson_topic"),
                prioritized_weak_topics=[
                    PrioritizedTopicResponse(**item) for item in report_prioritized
                ],
                drills=drill_set,
            )
        )
    return reports


def _build_error_tracking(
    rows: list[dict],
    student_id: str,
    view: error_pattern_service.ErrorTrackingView,
) -> ErrorTrackingResponse:
    sync_rows = error_pattern_service.patterns_for_db_sync(view, student_id)
    try:
        supabase_service.upsert_error_pattern_history(student_id, sync_rows)
    except Exception:
        pass

    latest = max(rows, key=lambda r: r.get("created_at") or "") if rows else None
    prioritized = error_pattern_service.build_prioritized_weak_topics(
        view, (latest or {}).get("weak_topics") or []
    )
    payload = error_pattern_service.tracking_to_dict(view)
    payload["prioritized_weak_topics"] = prioritized
    return ErrorTrackingResponse(**payload)


def _sync_and_build_goal_views(
    student: dict,
    report_rows: list[dict],
    tracking_view: error_pattern_service.ErrorTrackingView,
) -> tuple[
    Optional[StudyPlanResponse],
    Optional[ProgressTrackerResponse],
    Optional[ErrorTrackingResponse],
]:
    stuck_count = len(tracking_view.stuck_patterns)

    base_plan = goal_plan_service.compute_study_plan(
        student, report_rows, stuck_category_count=stuck_count
    )
    if not base_plan:
        error_tracking = (
            _build_error_tracking(report_rows, student["id"], tracking_view)
            if report_rows
            else None
        )
        return None, None, error_tracking

    period_start, period_end, _ = daily_progress_service.goal_period(student)
    if not period_start or not period_end:
        adjusted = goal_plan_service.compute_study_plan(
            student, report_rows, stuck_category_count=stuck_count
        )
        plan = adjusted or base_plan
        error_tracking = _build_error_tracking(
            report_rows, student["id"], tracking_view
        )
        return (
            StudyPlanResponse(**goal_plan_service.study_plan_to_dict(plan)),
            None,
            error_tracking,
        )

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
        student,
        report_rows,
        completion_rate=completion_rate,
        stuck_category_count=stuck_count,
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
    error_tracking = _build_error_tracking(report_rows, student["id"], tracking_view)
    return study_plan_response, tracker_response, error_tracking


@router.get("/students/{student_id}/reports", response_model=StudentReportsResponse)
def get_student_reports(student_id: str):
    """Return all lesson reports for a student."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    rows = supabase_service.get_student_reports(student_id)
    tracking_view = error_pattern_service.build_error_tracking(rows)
    reports = _report_models(rows, tracking_view)
    study_plan, progress_tracker, error_tracking = _sync_and_build_goal_views(
        student, rows, tracking_view
    )

    raw_hypotheses = supabase_service.get_error_hypotheses(student_id)
    hypothesis_responses = [
        ErrorHypothesisResponse(
            id=h["id"],
            pattern=h["pattern"],
            pattern_label=h["pattern_label"],
            examples=[HypothesisExample(**ex) for ex in (h.get("examples") or [])],
            occurrences=h["occurrences"],
            status=h["status"],
            disputed_by_student=h.get("disputed_by_student", False),
        )
        for h in raw_hypotheses
    ]

    return StudentReportsResponse(
        student_id=student["id"],
        student_name=student["name"],
        student_email=student["email"],
        reports=reports,
        study_plan=study_plan,
        progress_tracker=progress_tracker,
        error_tracking=error_tracking,
        hypotheses=hypothesis_responses,
        **_student_goal_fields(student),
    )


@router.post("/students/{student_id}/drills")
def save_drill_result(student_id: str, body: DrillResultRequest):
    """Record the student's answer to a drill exercise."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    supabase_service.save_drill_result(
        student_id=student_id,
        report_id=body.report_id,
        drill_index=body.drill_index,
        answer=body.answer,
        is_correct=body.is_correct,
        hypothesis_id=body.hypothesis_id,
    )
    return {"status": "saved"}


@router.post("/students/{student_id}/hypotheses/{hypothesis_id}/dismiss")
def dismiss_hypothesis(student_id: str, hypothesis_id: str):
    """Student marks an error pattern as a false observation."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    try:
        supabase_service.dismiss_hypothesis(hypothesis_id, student_id)
    except RuntimeError:
        raise HTTPException(status_code=404, detail="Hypothesis not found")
    return {"status": "dismissed"}


@router.patch("/students/{student_id}/goal", response_model=StudentReportsResponse)
def update_student_goal(student_id: str, body: StudentGoalUpdate):
    """Set or update the student's learning goal and duration-based study plan."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    goal_set = date.today()
    target_date = body.target_date
    if target_date is None:
        target_date = goal_set + timedelta(weeks=body.target_duration_weeks)
    elif target_date <= goal_set:
        raise HTTPException(status_code=400, detail="target_date must be in the future")

    intensity = normalize_intensity_preset(body.study_intensity_preset)
    tutor_lessons = body.tutor_lessons_per_week
    practice_days = body.practice_days_per_week
    if intensity:
        cfg = INTENSITY_PRESETS[intensity]
        tutor_lessons = cfg["tutor_lessons_per_week"]
        practice_days = cfg["practice_days_per_week"]

    try:
        supabase_service.clear_daily_progress(student_id)
        supabase_service.update_student_goal(
            student_id=student_id,
            goal_text=body.goal_text,
            current_level_tag=body.current_level_tag,
            target_duration_weeks=body.target_duration_weeks,
            target_date=target_date.isoformat(),
            tutor_lessons_per_week=tutor_lessons,
            tutor_lesson_minutes=body.tutor_lesson_minutes,
            practice_days_per_week=practice_days,
            study_intensity_preset=body.study_intensity_preset,
        )
    except RuntimeError:
        raise HTTPException(status_code=404, detail="Student not found")

    return get_student_reports(student_id)


@router.post("/students/{student_id}/practice", response_model=StudentReportsResponse)
def mark_practice(student_id: str, body: MarkPracticeRequest):
    """Mark practice for a day (defaults to today)."""
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

    supabase_service.mark_practice(
        student_id,
        practice_date.isoformat(),
        planned_minutes=planned,
        completed_minutes=completed_minutes,
    )

    return get_student_reports(student_id)


@router.get("/students/{student_id}/curriculum")
def get_student_curriculum(student_id: str, program_id: str):
    """Program class list with completion derived from lesson reports and progress."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    rows = supabase_service.get_student_reports(student_id)
    tracking_view = error_pattern_service.build_error_tracking(rows)
    stuck_count = len(tracking_view.stuck_patterns)
    plan = goal_plan_service.compute_study_plan(
        student, rows, stuck_category_count=stuck_count
    )

    progress_tracker = None
    if plan:
        period_start, period_end, _ = daily_progress_service.goal_period(student)
        if period_start and period_end:
            stored_rows = supabase_service.get_daily_progress(
                student_id, period_start.isoformat(), period_end.isoformat()
            )
            tracker = daily_progress_service.build_tracker(
                student, plan, stored_rows, rows
            )
            if tracker:
                progress_tracker = daily_progress_service.tracker_to_dict(tracker)

    curriculum = build_curriculum(program_id, rows, progress_tracker)
    if not curriculum:
        raise HTTPException(status_code=404, detail="Program not found")
    return curriculum


@router.post("/students/{student_id}/curriculum/{class_id}/complete")
def complete_curriculum_class(student_id: str, class_id: int):
    """
    Mark class complete — live completion is derived from lesson reports;
    returns refreshed curriculum snapshot.
    """
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    program_id = student.get("program_id") or "special-negotiations"
    rows = supabase_service.get_student_reports(student_id)
    tracking_view = error_pattern_service.build_error_tracking(rows)
    plan = goal_plan_service.compute_study_plan(
        student, rows, stuck_category_count=len(tracking_view.stuck_patterns)
    )
    progress_tracker = None
    if plan:
        period_start, period_end, _ = daily_progress_service.goal_period(student)
        if period_start and period_end:
            stored_rows = supabase_service.get_daily_progress(
                student_id, period_start.isoformat(), period_end.isoformat()
            )
            tracker = daily_progress_service.build_tracker(
                student, plan, stored_rows, rows
            )
            if tracker:
                progress_tracker = daily_progress_service.tracker_to_dict(tracker)

    curriculum = build_curriculum(program_id, rows, progress_tracker)
    if not curriculum:
        raise HTTPException(status_code=404, detail="Program not found")
    return curriculum


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
