"""Website origins allowed to call the public drill API (HTTP via CORS, and the live-dialogue WebSocket)."""
from __future__ import annotations

import os
from typing import List

# Live Server / static dev (e.g. :5500) loads HTML while the API runs on uvicorn.
LOCAL_ORIGINS = [
    "http://127.0.0.1:5500", "http://localhost:5500",
    "http://127.0.0.1:5501", "http://localhost:5501",
    "http://127.0.0.1:5502", "http://localhost:5502",
]


def allowed_origins() -> List[str]:
    """DRILL_CORS_ORIGINS (comma separated) plus the local development ports."""
    configured = [o.strip() for o in os.getenv("DRILL_CORS_ORIGINS", "").split(",") if o.strip()]
    return configured + LOCAL_ORIGINS
