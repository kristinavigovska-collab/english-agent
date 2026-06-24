#!/usr/bin/env python3
"""Validate and sync program catalog: data/programs_catalog.json → Supabase.

Canonical file source: data/programs_catalog.json (not dashboard.js).
Runtime API reads Supabase first, then JSON fallback.

Usage:
  python scripts/sync_programs_catalog.py --check     # validate JSON only
  python scripts/sync_programs_catalog.py --dry-run   # validate, show rows
  python scripts/sync_programs_catalog.py             # validate + upsert to DB
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from services.programs_catalog import (
    CATALOG_JSON_PATH,
    clear_programs_catalog_cache,
    program_api_to_row,
    read_catalog_json_file,
    validate_programs_catalog,
)


def upsert_catalog_to_db(catalog: list[dict]) -> int:
    from services.supabase_service import get_supabase

    db = get_supabase()
    for index, program in enumerate(catalog):
        row = program_api_to_row(program, (index + 1) * 10)
        db.table("programs").upsert(row, on_conflict="id").execute()
    clear_programs_catalog_cache()
    return len(catalog)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate JSON only (no database writes)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print rows that would be upserted",
    )
    args = parser.parse_args()

    if not CATALOG_JSON_PATH.is_file():
        print(f"Catalog file not found: {CATALOG_JSON_PATH}", file=sys.stderr)
        return 1

    catalog = read_catalog_json_file()
    errors = validate_programs_catalog(catalog)
    if errors:
        print("Catalog validation failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(f"Validated {len(catalog)} programs in {CATALOG_JSON_PATH}")

    if args.check:
        return 0

    if args.dry_run:
        for index, program in enumerate(catalog):
            row = program_api_to_row(program, (index + 1) * 10)
            print(f"  {row['id']}  sort_order={row['sort_order']}")
        return 0

    count = upsert_catalog_to_db(catalog)
    print(f"Upserted {count} programs to Supabase.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
