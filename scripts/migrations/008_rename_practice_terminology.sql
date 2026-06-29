-- Rename self_practice progress source and update solo plan copy (practice terminology).
-- Run after 003_add_daily_progress.sql and 007_add_programs_catalog.sql.

UPDATE daily_progress SET source = 'practice' WHERE source = 'self_practice';

ALTER TABLE daily_progress DROP CONSTRAINT IF EXISTS daily_progress_source_check;

ALTER TABLE daily_progress ADD CONSTRAINT daily_progress_source_check
    CHECK (source IS NULL OR source IN ('lesson', 'practice'));

UPDATE program_plans
SET
    card_title = 'Practice',
    features = replace(features::text, 'AI Tutor for self-study', 'AI Tutor for practice')::jsonb
WHERE id = 'solo';
