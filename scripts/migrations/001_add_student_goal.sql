-- Student learning goal (profile-level, not per lesson).
-- Run in Supabase SQL Editor.

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS target_cefr_level TEXT
        CHECK (target_cefr_level IS NULL OR target_cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    ADD COLUMN IF NOT EXISTS target_date DATE,
    ADD COLUMN IF NOT EXISTS goal_label TEXT,
    ADD COLUMN IF NOT EXISTS goal_set_date DATE;
