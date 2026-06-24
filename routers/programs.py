"""Program catalog + student enrollment API."""

from fastapi import APIRouter, HTTPException

from models.schemas import (
    StudentEnrollmentPayload,
    StudentEnrollmentResponse,
    StudentEnrollmentUpdate,
)
from services import enrollment_service, supabase_service
from services.programs_catalog import get_program, load_programs_catalog

router = APIRouter()


@router.get("/programs")
def list_programs():
    """Return the full school program catalog for the dashboard."""
    return {"programs": load_programs_catalog()}


@router.get("/programs/{program_id}")
def get_program_by_id(program_id: str):
    """Return one program from the catalog (for detail pages / curriculum load later)."""
    program = get_program(program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="Program not found")
    return {"program": program}


@router.get(
    "/students/{student_id}/enrollment",
    response_model=StudentEnrollmentPayload,
)
def get_student_enrollment(student_id: str):
    """Return the student's active enrollment, or null if none."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    enrollment = enrollment_service.get_student_enrollment(student_id)
    return {"enrollment": enrollment}


@router.put(
    "/students/{student_id}/enrollment",
    response_model=StudentEnrollmentPayload,
)
def put_student_enrollment(student_id: str, body: StudentEnrollmentUpdate):
    """Set or replace the student's active program + subscription plan."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        enrollment = enrollment_service.set_student_enrollment(
            student_id,
            program_id=body.program_id,
            plan_id=body.plan_id,
            status=body.status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"enrollment": enrollment}


@router.delete(
    "/students/{student_id}/enrollment",
    response_model=StudentEnrollmentPayload,
)
def delete_student_enrollment(student_id: str):
    """Cancel the student's active enrollment."""
    student = supabase_service.get_student(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    enrollment_service.clear_student_enrollment(student_id)
    return {"enrollment": None}
