-- Optional study intensity preset (once_week | few_times_week | daily).
ALTER TABLE students
    ADD COLUMN IF NOT EXISTS study_intensity_preset TEXT;
