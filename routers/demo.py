"""Demo API — serves fixture-shaped responses; recalculates via Python services (ADR-002)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import demo_state

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/demo", tags=["demo"])

FIXTURES = Path(__file__).resolve().parent.parent / "data" / "fixtures"


def _fixture_or_compute(name: str, key: str) -> Any:
    demo_state.ensure_loaded()
    bundle = demo_state.build_bundle()
    value = bundle.get(key)
    if value is not None:
        return value
    path = FIXTURES / name
    if path.is_file():
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    raise HTTPException(status_code=404, detail=f"Demo fixture missing: {name}")


class DemoGoalUpdate(BaseModel):
    goal_type: Optional[str] = None
    target_cefr_level: Optional[str] = None
    target_duration_weeks: Optional[int] = Field(None, ge=1, le=104)
    target_date: Optional[str] = None
    goal_label: Optional[str] = None
    scenario_description: Optional[str] = None
    tutor_lessons_per_week: Optional[int] = Field(None, ge=1, le=14)
    tutor_lesson_minutes: Optional[int] = Field(None, ge=15, le=180)
    practice_days_per_week: Optional[int] = Field(None, ge=1, le=7)
    study_intensity_preset: Optional[str] = None


class DemoCompleteRequest(BaseModel):
    lesson: bool = True
    self_study: bool = True


@router.get("/reports")
def demo_reports():
    """Full demo bundle (same shape as GET /api/students/{id}/reports)."""
    return demo_state.build_bundle()


@router.get("/study-plan")
def demo_study_plan():
    return _fixture_or_compute("study_plan.json", "study_plan")


@router.get("/error-patterns")
def demo_error_patterns():
    return _fixture_or_compute("error_patterns.json", "error_tracking")


@router.get("/progress-tracker")
def demo_progress_tracker():
    return _fixture_or_compute("progress_tracker.json", "progress_tracker")


@router.get("/curriculum")
def demo_curriculum():
    bundle = demo_state.build_bundle()
    curriculum = bundle.get("curriculum")
    if curriculum:
        return curriculum
    return _fixture_or_compute("curriculum.json", "curriculum")


@router.post("/goal")
def demo_update_goal(body: DemoGoalUpdate):
    """Recalculate demo study plan after in-memory goal change."""
    demo_state.update_goal(body.model_dump(exclude_unset=True))
    return demo_state.build_bundle()


@router.post("/curriculum/{class_id}/complete")
def demo_complete_class(class_id: int, body: DemoCompleteRequest = DemoCompleteRequest()):
    demo_state.mark_class_complete(class_id, lesson=body.lesson, self_study=body.self_study)
    bundle = demo_state.build_bundle()
    curriculum = bundle.get("curriculum")
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum not available")
    return curriculum
