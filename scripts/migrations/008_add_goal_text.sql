-- Migration 008: replace CEFR-as-goal with free-text goal + current_level_tag
-- goal_text: student's real objective in their own words (e.g. "Переговоры с клиентами")
-- current_level_tag: diagnostic CEFR tag, NOT a target (e.g. "B1")

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS goal_text TEXT,
  ADD COLUMN IF NOT EXISTS current_level_tag VARCHAR(10);
