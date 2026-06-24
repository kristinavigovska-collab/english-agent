from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
UNKNOWN_STUDENT = "00000000-0000-0000-0000-000000000099"


def test_get_enrollment_unknown_student_returns_404():
    response = client.get(f"/api/students/{UNKNOWN_STUDENT}/enrollment")
    assert response.status_code == 404


def test_put_enrollment_unknown_student_returns_404():
    response = client.put(
        f"/api/students/{UNKNOWN_STUDENT}/enrollment",
        json={"program_id": "general-beginner", "plan_id": "standard"},
    )
    assert response.status_code == 404


def test_put_enrollment_unknown_program_returns_400():
    response = client.put(
        f"/api/students/{UNKNOWN_STUDENT}/enrollment",
        json={"program_id": "does-not-exist", "plan_id": "standard"},
    )
    assert response.status_code in (400, 404)


def test_delete_enrollment_unknown_student_returns_404():
    response = client.delete(f"/api/students/{UNKNOWN_STUDENT}/enrollment")
    assert response.status_code == 404
