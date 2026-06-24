"""Public app configuration (ADR-002)."""

from fastapi import APIRouter

from services.app_config import get_public_config

router = APIRouter()


@router.get("/config")
def get_config():
    """Return shared constants for dashboard rendering (no business logic on client)."""
    return get_public_config()
