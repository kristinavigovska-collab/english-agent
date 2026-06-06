from pydantic import BaseModel, Field
from typing import Any, Optional
from datetime import datetime


class GrammarError(BaseModel):
    error: str
    correction: str
    alternatives: list[str] = Field(min_length=3, max_length=3)


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


class StudentCreate(BaseModel):
    name: str
    email: str


class LessonCreate(BaseModel):
    student_id: str
    meeting_id: str
    transcript: str


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


class StudentReportsResponse(BaseModel):
    student_id: str
    student_name: str
    student_email: str
    reports: list[ReportResponse]
