# Supabase migrations

SQL files live in `scripts/migrations/`. Apply **in numeric order** on a project that already has base tables (`students`, `lessons`, `reports` — see `README.md`).

| File | Purpose |
|------|---------|
| `001_add_student_goal.sql` | Goal fields on `students` (target CEFR, date, label) |
| `002_add_study_plan_fields.sql` | Goal type, duration, scenario, tutor/practice schedule |
| `003_add_daily_progress.sql` | `daily_progress` table for habit grid |
| `004_add_error_pattern_history.sql` | `error_pattern_history` for cross-lesson error tracking |
| `005_add_lesson_topic.sql` | `lessons.lesson_topic` from calendar event title / Recall metadata |
| `006_add_study_intensity_preset.sql` | `students.study_intensity_preset` (`once_week` \| `few_times_week` \| `daily`) |
| `007_add_programs_catalog.sql` | `programs`, `program_plans`, `student_enrollments` + seed catalog (16 programs, 5 plans) |
| `008_rename_practice_terminology.sql` | `daily_progress.source`: `self_practice` → `practice`; solo plan copy |

## Apply via CLI

Requires one of:

- `SUPABASE_ACCESS_TOKEN` (`sbp_…` from [Supabase account tokens](https://supabase.com/dashboard/account/tokens)) + `SUPABASE_URL`
- `DATABASE_URL` (direct Postgres; needs `psycopg2-binary`)

```bash
python scripts/run_supabase_migration.py 001_add_student_goal.sql
python scripts/run_supabase_migration.py 002_add_study_plan_fields.sql
python scripts/run_supabase_migration.py 003_add_daily_progress.sql
python scripts/run_supabase_migration.py 004_add_error_pattern_history.sql
python scripts/run_supabase_migration.py 005_add_lesson_topic.sql
python scripts/run_supabase_migration.py 006_add_study_intensity_preset.sql
python scripts/run_supabase_migration.py 008_rename_practice_terminology.sql
```

Default (no argument) runs `001_add_student_goal.sql`.

## Manual apply

Paste each file into **Supabase → SQL Editor** and run. Migrations use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` where possible — safe to re-run.

## Verify

After 001–006:

- `students` has goal + plan columns and `study_intensity_preset`
- `lessons` has `lesson_topic`
- Tables `daily_progress`, `error_pattern_history` exist
- `GET /api/students/{id}/reports` returns `study_plan`, `progress_tracker`, `error_tracking`, and `study_intensity_preset` when goal is set
- Reports payload includes `lesson_topic` per lesson when populated by webhook

After **007** (programs backend — schema only until API ships):

- Tables `programs` (16 rows), `program_plans` (5 rows), `student_enrollments` exist
- Dashboard still uses JS placeholders until `GET /api/programs` and enrollment endpoints are wired — see `docs/PROGRAMS.md`
