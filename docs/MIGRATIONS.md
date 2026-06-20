# Supabase migrations

SQL files live in `scripts/migrations/`. Apply **in numeric order** on a project that already has base tables (`students`, `lessons`, `reports` — see `README.md`).

| File | Purpose |
|------|---------|
| `001_add_student_goal.sql` | Goal fields on `students` (target CEFR, date, label) |
| `002_add_study_plan_fields.sql` | Goal type, duration, scenario, tutor/practice schedule |
| `003_add_daily_progress.sql` | `daily_progress` table for habit grid |
| `004_add_error_pattern_history.sql` | `error_pattern_history` for cross-lesson error tracking |

## Apply via CLI

Requires one of:

- `SUPABASE_ACCESS_TOKEN` (`sbp_…` from [Supabase account tokens](https://supabase.com/dashboard/account/tokens)) + `SUPABASE_URL`
- `DATABASE_URL` (direct Postgres; needs `psycopg2-binary`)

```bash
python scripts/run_supabase_migration.py 001_add_student_goal.sql
python scripts/run_supabase_migration.py 002_add_study_plan_fields.sql
python scripts/run_supabase_migration.py 003_add_daily_progress.sql
python scripts/run_supabase_migration.py 004_add_error_pattern_history.sql
```

Default (no argument) runs `001_add_student_goal.sql`.

## Manual apply

Paste each file into **Supabase → SQL Editor** and run. Migrations use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` where possible — safe to re-run.

## Verify

After all four:

- `students` has goal + plan columns
- Tables `daily_progress`, `error_pattern_history` exist
- `GET /api/students/{id}/reports` returns `study_plan`, `progress_tracker`, `error_tracking` when goal is set
