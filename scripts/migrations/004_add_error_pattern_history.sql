-- Cross-lesson error pattern history (student × error_category).
-- Run via scripts/run_supabase_migration.py

CREATE TABLE IF NOT EXISTS error_pattern_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
    error_category TEXT NOT NULL,
    occurrences JSONB NOT NULL DEFAULT '[]',
    first_seen_date DATE,
    last_seen_date DATE,
    total_occurrences INTEGER NOT NULL DEFAULT 0,
    consecutive_lessons_count INTEGER NOT NULL DEFAULT 0,
    max_consecutive_lessons INTEGER NOT NULL DEFAULT 0,
    was_stuck BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_date DATE,
    status TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (student_id, error_category)
);

CREATE INDEX IF NOT EXISTS idx_error_pattern_history_student
    ON error_pattern_history (student_id);
