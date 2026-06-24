"""Public dashboard preview — fixture data for empty-state UI (ADR-002)."""

from fastapi import APIRouter

from services import demo_state

router = APIRouter(prefix="/preview", tags=["preview"])


@router.get("/dashboard")
def preview_dashboard():
    """
    Example analytics / progress visualization before learning starts.
    Same shape as GET /api/students/{id}/reports; values from Python services.
    """
    return demo_state.build_bundle()
