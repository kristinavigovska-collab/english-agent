-- Lesson topic from calendar event title (Recall Calendar V1 / meeting metadata).
ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS lesson_topic TEXT;
