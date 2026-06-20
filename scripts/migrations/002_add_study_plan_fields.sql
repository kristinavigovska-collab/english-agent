-- Study plan fields: goal type, duration, tutor schedule, scenario text.
-- Run in Supabase SQL Editor or via scripts/run_supabase_migration.py

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS goal_type TEXT
        CHECK (goal_type IS NULL OR goal_type IN ('general_level', 'scenario_based')),
    ADD COLUMN IF NOT EXISTS target_duration_weeks INTEGER
        CHECK (target_duration_weeks IS NULL OR target_duration_weeks BETWEEN 1 AND 104),
    ADD COLUMN IF NOT EXISTS scenario_description TEXT,
    ADD COLUMN IF NOT EXISTS goal_start_cefr_level TEXT
        CHECK (goal_start_cefr_level IS NULL OR goal_start_cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    ADD COLUMN IF NOT EXISTS tutor_lessons_per_week INTEGER DEFAULT 2
        CHECK (tutor_lessons_per_week IS NULL OR tutor_lessons_per_week BETWEEN 0 AND 14),
    ADD COLUMN IF NOT EXISTS tutor_lesson_minutes INTEGER DEFAULT 60
        CHECK (tutor_lesson_minutes IS NULL OR tutor_lesson_minutes BETWEEN 15 AND 180),
    ADD COLUMN IF NOT EXISTS practice_days_per_week INTEGER DEFAULT 6
        CHECK (practice_days_per_week IS NULL OR practice_days_per_week BETWEEN 1 AND 7);
