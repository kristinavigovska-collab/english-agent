"""Study intensity presets — classes per week for curriculum pacing."""

from __future__ import annotations

from typing import Literal, Optional, TypedDict

StudyIntensityPreset = Literal["once_week", "few_times_week", "daily"]

INTENSITY_PRESET_KEYS: tuple[StudyIntensityPreset, ...] = (
    "once_week",
    "few_times_week",
    "daily",
)


class IntensityPresetConfig(TypedDict):
    label: str
    classes_per_week: float
    tutor_lessons_per_week: int
    practice_days_per_week: int


INTENSITY_PRESETS: dict[StudyIntensityPreset, IntensityPresetConfig] = {
    "once_week": {
        "label": "1 раз в неделю",
        "classes_per_week": 1.0,
        "tutor_lessons_per_week": 1,
        "practice_days_per_week": 1,
    },
    "few_times_week": {
        "label": "2–3 раза в неделю",
        "classes_per_week": 2.5,
        "tutor_lessons_per_week": 3,
        "practice_days_per_week": 3,
    },
    "daily": {
        "label": "Каждый день",
        "classes_per_week": 7.0,
        "tutor_lessons_per_week": 7,
        "practice_days_per_week": 7,
    },
}


def normalize_intensity_preset(value: Optional[str]) -> Optional[StudyIntensityPreset]:
    if not value:
        return None
    key = value.strip()
    if key in INTENSITY_PRESETS:
        return key  # type: ignore[return-value]
    return None
