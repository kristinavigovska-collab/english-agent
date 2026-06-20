#!/usr/bin/env python3
"""Apply SQL migration files to Supabase.

Uses Supabase Management API when SUPABASE_ACCESS_TOKEN is set (sbp_...).
Falls back to direct Postgres when DATABASE_URL is set.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "scripts" / "migrations"


def load_sql(path: Path) -> str:
    sql = path.read_text(encoding="utf-8").strip()
    if not sql:
        raise ValueError(f"Migration file is empty: {path}")
    return sql


def project_ref_from_url(url: str) -> str:
    # https://abcdefgh.supabase.co -> abcdefgh
    host = url.removeprefix("https://").removeprefix("http://").split("/")[0]
    return host.split(".")[0]


def run_via_management_api(sql: str, access_token: str, project_ref: str) -> None:
    response = httpx.post(
        f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json={"query": sql},
        timeout=60.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Management API error {response.status_code}: {response.text[:500]}"
        )


def run_via_database_url(sql: str, database_url: str) -> None:
    try:
        import psycopg2
    except ImportError as exc:
        raise RuntimeError(
            "DATABASE_URL is set but psycopg2 is not installed. "
            "Run: pip install psycopg2-binary"
        ) from exc

    with psycopg2.connect(database_url) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)


def main() -> int:
    load_dotenv(ROOT / ".env")

    migration_name = sys.argv[1] if len(sys.argv) > 1 else "001_add_student_goal.sql"
    migration_path = MIGRATIONS_DIR / migration_name
    if not migration_path.exists():
        print(f"Migration not found: {migration_path}", file=sys.stderr)
        return 1

    sql = load_sql(migration_path)
    access_token = os.getenv("SUPABASE_ACCESS_TOKEN")
    database_url = os.getenv("DATABASE_URL")
    supabase_url = os.getenv("SUPABASE_URL")

    if access_token:
        if not supabase_url:
            print("SUPABASE_URL is required with SUPABASE_ACCESS_TOKEN", file=sys.stderr)
            return 1
        project_ref = project_ref_from_url(supabase_url)
        print(f"Applying {migration_name} via Management API ({project_ref})...")
        run_via_management_api(sql, access_token, project_ref)
    elif database_url:
        print(f"Applying {migration_name} via DATABASE_URL...")
        run_via_database_url(sql, database_url)
    else:
        print(
            "Set SUPABASE_ACCESS_TOKEN (sbp_...) or DATABASE_URL in .env\n"
            "Access token: https://supabase.com/dashboard/account/tokens",
            file=sys.stderr,
        )
        return 1

    print("Migration applied successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
