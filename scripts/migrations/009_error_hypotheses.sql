-- Migration 009: error_hypotheses table
-- Cross-lesson error patterns with per-student dismissal.

CREATE TABLE IF NOT EXISTS error_hypotheses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  pattern             TEXT NOT NULL,
  pattern_label       TEXT NOT NULL,
  examples            JSONB NOT NULL DEFAULT '[]',
  occurrences         INTEGER NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'observed'
                        CHECK (status IN ('observed', 'drilling', 'confirmed', 'dismissed')),
  disputed_by_student BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, pattern)
);

CREATE INDEX IF NOT EXISTS idx_error_hypotheses_student
  ON error_hypotheses (student_id, status);
