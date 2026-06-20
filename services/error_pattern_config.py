"""Thresholds for recurring error pattern tracking."""

# Lessons in a row with the same category → "stuck"
STUCK_LESSONS_THRESHOLD = 3

# Lessons without the category after being stuck → "resolved"
RESOLVED_ABSENCE_LESSONS = 2

# Study-plan load bump when many stuck patterns slow real progress
STUCK_LOAD_MULTIPLIER = 1.10
STUCK_LOAD_MIN_CATEGORIES = 2
