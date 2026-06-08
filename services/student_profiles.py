"""Student profiles passed to Claude for speaker ID and learning goals.

Phase 2 (now): single test student while calibrating agent scoring.
Phase 3 (later): school Google Calendar — guest email identifies each student;
profiles move to Supabase or are derived from calendar metadata.
"""

from typing import NotRequired, TypedDict


class StudentProfile(TypedDict):
    display_name: str
    name_aliases: list[str]
    goal: str
    course_level: NotRequired[str]


# Keyed by lowercase email from calendar guest / Recall participant metadata.
STUDENT_PROFILES: dict[str, StudentProfile] = {
    "kristina.vigovska@gmail.com": {
        "display_name": "Кристина",
        "name_aliases": ["Kristina", "Кристина", "kristina", "Kristina Vigovska"],
        "goal": (
            "Свободно участвовать в дискуссиях. "
            "Быть уверенным Upper-Intermediate (CEFR B2)."
        ),
        "course_level": "upper_intermediate",
    },
}


def get_student_profile(email: str) -> StudentProfile | None:
    if not email:
        return None
    return STUDENT_PROFILES.get(email.strip().lower())
