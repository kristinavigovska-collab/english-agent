-- Migration 010: drills per lesson + student answers

-- Generated drills live in reports.drills (JSONB array added here).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS drills JSONB;

-- Student answers to drills.
CREATE TABLE IF NOT EXISTS drill_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  report_id      UUID REFERENCES reports(id)  ON DELETE CASCADE NOT NULL,
  hypothesis_id  UUID REFERENCES error_hypotheses(id) ON DELETE SET NULL,
  drill_index    INTEGER NOT NULL,
  answer         TEXT,
  is_correct     BOOLEAN,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drill_results_student
  ON drill_results (student_id, report_id);
