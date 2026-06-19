from pydantic import BaseModel, Field, field_validator
from typing import Any, Literal, Optional
from datetime import date, datetime

CefrLevel = Literal["A1", "A2", "B1", "B2", "C1", "C2"]
CEFR_LEVELS: tuple[str, ...] = ("A1", "A2", "B1", "B2", "C1", "C2")


class GrammarError(BaseModel):
    error: str
    correction: str
    explanation: str


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


class StudentGoalUpdate(BaseModel):
    target_cefr_level: CefrLevel
    target_date: date
    goal_label: Optional[str] = Field(default=None, max_length=500)

    @field_validator("target_date")
    @classmethod
    def target_date_must_be_future(cls, value: date) -> date:
        if value <= date.today():
            raise ValueError("target_date must be in the future")
        return value

    @field_validator("goal_label")
    @classmethod
    def strip_goal_label(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class StudentReportsResponse(BaseModel):
    student_id: str
    student_name: str
    student_email: str
    target_cefr_level: Optional[str] = None
    target_date: Optional[date] = None
    goal_label: Optional[str] = None
    goal_set_date: Optional[date] = None
    reports: list[ReportResponse]
