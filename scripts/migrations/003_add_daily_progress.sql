-- Daily progress tracker for goal period (habit-style grid).
-- Run in Supabase SQL Editor or via scripts/run_supabase_migration.py

CREATE TABLE IF NOT EXISTS daily_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
    progress_date DATE NOT NULL,
    planned_minutes INTEGER NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_minutes INTEGER,
    source TEXT CHECK (source IS NULL OR source IN ('lesson', 'self_practice')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (student_id, progress_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_progress_student_date
    ON daily_progress (student_id, progress_date);
