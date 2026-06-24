"""Program catalog for server-side curriculum (ids match PROGRAM_CATALOG in dashboard.js / migration 007)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

_CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "programs_catalog.json"


@lru_cache(maxsize=1)
def load_programs_catalog() -> list[dict[str, Any]]:
    if not _CATALOG_PATH.is_file():
        return []
    with _CATALOG_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def get_program(program_id: str) -> Optional[dict[str, Any]]:
    for program in load_programs_catalog():
        if program.get("id") == program_id:
            return program
    return None
