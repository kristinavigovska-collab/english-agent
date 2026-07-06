from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Any, Literal, Optional
from datetime import date, datetime, timedelta

from services.error_category_config import normalize_category

CefrLevel = Literal["A1", "A2", "B1", "B2", "C1", "C2"]
CEFR_LEVELS: tuple[str, ...] = ("A1", "A2", "B1", "B2", "C1", "C2")
GoalType = Literal["general_level", "scenario_based"]
StudyIntensityPreset = Literal["once_week", "few_times_week", "daily"]
PlanStatus = Literal["on_track", "behind", "ahead"]
ProgramPlanId = Literal["free_trial", "solo", "light", "standard", "intensive"]
EnrollmentStatus = Literal["active", "trial", "paused", "cancelled", "expired"]


class GrammarError(BaseModel):
    error: str
    correction: str
    explanation: str
    error_category: str = "other"

    @field_validator("error_category")
    @classmethod
    def normalize_error_category(cls, value: str) -> str:
        return normalize_category(value)


class LessonAnalysis(BaseModel):
    grammar_errors: list[GrammarError]
    vocabulary_level: str = Field(
        description="CEFR level: A1, A2, B1, B2, C1, or C2"
    )
    fluency_score: float = Field(ge=0.0, le=10.0)
    weak_topics: list[str]
    recommendations: list[str]


class RecallWebhookPayload(BaseModel):
    event: str
    data: dict[str, Any]


class PrioritizedTopicResponse(BaseModel):
    text: str
    priority: str
    consecutive_lessons_count: int = 0


class ReportResponse(BaseModel):
    id: str
    lesson_id: str
    student_id: str
    grammar_errors: list[dict]
    vocabulary_level: str
    fluency_score: float
    weak_topics: list[str]
    recommendations: list[str]
    created_at: Optional[datetime]
    meeting_id: Optional[str] = None
    lesson_date: Optional[datetime] = None
    lesson_topic: Optional[str] = None
    prioritized_weak_topics: list[PrioritizedTopicResponse] = []
    drills: Optional[DrillSet] = None


class StudyPlanResponse(BaseModel):
    hours_per_week: float
    minutes_per_day: float
    tutor_hours_per_week: float
    practice_hours_per_week: float
    total_hours: float
    hours_completed: float
    hours_remaining: float
    weeks_total: int
    weeks_elapsed: int
    weeks_remaining: int
    progress_percent: float
    status: PlanStatus
    status_message: str
    disclaimer: str
    goal_type: str
    scenario_description: Optional[str] = None
    current_cefr: str
    target_cefr: str
    start_cefr: str


class DailyProgressDayResponse(BaseModel):
    date: date
    day_index: int
    planned_minutes: int
    completed: bool
    completed_minutes: Optional[int] = None
    source: Optional[str] = None
    state: str


class ProgressTrackerResponse(BaseModel):
    days: list[DailyProgressDayResponse]
    weeks: list[list[DailyProgressDayResponse]]
    completed_days: int
    planned_days_elapsed: int
    streak: int
    pace_warning: Optional[str] = None
    can_mark_today: bool
    today_planned_minutes: int
    goal_start_date: date
    goal_end_date: date


class MarkPracticeRequest(BaseModel):
    progress_date: Optional[date] = None
    completed_minutes: Optional[int] = Field(default=None, ge=1, le=480)


class ErrorPatternOccurrenceResponse(BaseModel):
    lesson_id: str
    report_id: str
    date: date
    count_in_lesson: int


class ErrorPatternResponse(BaseModel):
    error_category: str
    label: str
    occurrences: list[ErrorPatternOccurrenceResponse]
    first_seen_date: date
    last_seen_date: date
    total_occurrences: int
    consecutive_lessons_count: int
    max_consecutive_lessons: int
    status: str
    resolved_date: Optional[date] = None
    was_stuck: bool


class StuckTopicResponse(BaseModel):
    error_category: str
    label: str
    consecutive_lessons_count: int
    message: str


class ErrorTrackingResponse(BaseModel):
    patterns: list[ErrorPatternResponse]
    stuck_patterns: list[ErrorPatternResponse]
    new_patterns: list[ErrorPatternResponse]
    stuck_topics: list[StuckTopicResponse]
    prioritized_weak_topics: list[PrioritizedTopicResponse] = []


class StudentGoalUpdate(BaseModel):
    goal_text: str = Field(min_length=1, max_length=500)
    current_level_tag: Optional[CefrLevel] = None
    target_duration_weeks: int = Field(ge=1, le=104)
    target_date: Optional[date] = None
    tutor_lessons_per_week: int = Field(default=2, ge=0, le=14)
    tutor_lesson_minutes: int = Field(default=60, ge=15, le=180)
    practice_days_per_week: int = Field(default=6, ge=1, le=7)
    study_intensity_preset: Optional[StudyIntensityPreset] = None

    @field_validator("goal_text")
    @classmethod
    def strip_goal_text(cls, value: str) -> str:
        return value.strip()


class StudentReportsResponse(BaseModel):
    student_id: str
    student_name: str
    student_email: str
    goal_text: Optional[str] = None
    current_level_tag: Optional[str] = None
    target_date: Optional[date] = None
    goal_set_date: Optional[date] = None
    target_duration_weeks: Optional[int] = None
    tutor_lessons_per_week: Optional[int] = None
    tutor_lesson_minutes: Optional[int] = None
    practice_days_per_week: Optional[int] = None
    study_intensity_preset: Optional[str] = None
    # legacy fields kept for backward compat during transition
    target_cefr_level: Optional[str] = None
    goal_label: Optional[str] = None
    goal_type: Optional[str] = None
    scenario_description: Optional[str] = None
    goal_start_cefr_level: Optional[str] = None
    study_plan: Optional[StudyPlanResponse] = None
    progress_tracker: Optional[ProgressTrackerResponse] = None
    error_tracking: Optional[ErrorTrackingResponse] = None
    hypotheses: list[ErrorHypothesisResponse] = []
    reports: list[ReportResponse]


class Drill(BaseModel):
    type: str = "choice"
    prompt: str
    context: str = ""
    options: list[str] = []
    correct_index: int = 0
    explanation: str = ""


class DrillSet(BaseModel):
    pattern: str
    pattern_label: str
    hypothesis_id: Optional[str] = None
    drills: list[Drill] = []


class DrillResultRequest(BaseModel):
    report_id: str
    drill_index: int = Field(ge=0, le=9)
    answer: str
    is_correct: bool
    hypothesis_id: Optional[str] = None


class HypothesisExample(BaseModel):
    error: str = ""
    correction: str = ""
    explanation: str = ""
    lesson_id: Optional[str] = None


class ErrorHypothesisResponse(BaseModel):
    id: str
    pattern: str
    pattern_label: str
    examples: list[HypothesisExample] = []
    occurrences: int = 1
    status: str = "observed"
    disputed_by_student: bool = False


class StudentEnrollmentUpdate(BaseModel):
    program_id: str = Field(min_length=1, max_length=120)
    plan_id: ProgramPlanId = "standard"
    status: EnrollmentStatus = "active"

    @field_validator("program_id")
    @classmethod
    def strip_program_id(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("program_id is required")
        return trimmed


class StudentEnrollmentResponse(BaseModel):
    program_id: str
    plan_id: str
    status: str
    level_id: str
    level_cefr: Optional[str] = None
    level_name: Optional[str] = None
    program_name: Optional[str] = None
    track_category: Optional[str] = None
    enrolled_at: Optional[datetime] = None
    student_confirmed: bool = True


class StudentEnrollmentPayload(BaseModel):
    enrollment: Optional[StudentEnrollmentResponse] = None
