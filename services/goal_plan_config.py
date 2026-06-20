"""CEFR study-hour norms — configurable estimates, not precise science."""

# Cambridge-style guideline: ~180–200 guided learning hours per CEFR level.
HOURS_PER_CEFR_LEVEL = 190

# Narrow scenario goals (interview, meeting) need a fraction of a full level jump.
SCENARIO_BASED_COEFFICIENT = 0.5

# Defaults for tutor schedule when student does not specify.
DEFAULT_TUTOR_LESSONS_PER_WEEK = 2
DEFAULT_TUTOR_LESSON_MINUTES = 60
DEFAULT_PRACTICE_DAYS_PER_WEEK = 6

PLAN_DISCLAIMER = (
    "Расчёт на основе средних нормативов CEFR (~190 ч/уровень), "
    "уточняется по мере вашего прогресса"
)
