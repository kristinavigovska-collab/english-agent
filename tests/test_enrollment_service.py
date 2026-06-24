from services.enrollment_service import (
    VALID_PLAN_IDS,
    enrollment_row_to_api,
    set_student_enrollment,
)
from services.programs_catalog import get_program


def test_enrollment_row_to_api_shape():
    row = {
        "program_id": "general-intermediate",
        "plan_id": "standard",
        "status": "active",
        "started_at": "2026-06-01T10:00:00+00:00",
    }
    program = get_program("general-intermediate")
    assert program is not None

    api = enrollment_row_to_api(row, program)
    assert api["program_id"] == "general-intermediate"
    assert api["plan_id"] == "standard"
    assert api["level_id"] == "intermediate"
    assert api["level_cefr"] == "B1"
    assert api["program_name"] == program["title"]
    assert api["student_confirmed"] is True


def test_valid_plan_ids_include_standard():
    assert "standard" in VALID_PLAN_IDS


def test_set_student_enrollment_rejects_unknown_program():
    try:
        set_student_enrollment(
            "00000000-0000-0000-0000-000000000001",
            program_id="does-not-exist",
            plan_id="standard",
        )
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Unknown program_id" in str(exc)
