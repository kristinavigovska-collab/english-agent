from __future__ import annotations

import json
import os

import anthropic
from dotenv import load_dotenv

from models.schemas import LessonAnalysis
from services.error_category_config import ERROR_CATEGORY_IDS, normalize_category
from services.rubric_service import get_rubric_prompt
from services.student_profiles import get_student_profile

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """\
You are an expert English language coach analyzing a transcript from a student's English lesson.

Your task is to evaluate the STUDENT's English proficiency based solely on their speech in the transcript.

Speaker rules (critical):
- The user message identifies exactly ONE student (name, email, and likely speaker labels).
- Analyze ONLY lines spoken by that student. Match speaker labels flexibly (name variants, email, first name).
- Treat ALL other speakers as the teacher or third parties — ignore their speech completely.
- Do not attribute the teacher's mistakes or vocabulary to the student.

Analyze the following dimensions:

1. **Grammar errors** — Identify specific grammatical mistakes the student made. For each error, provide:
   - The exact error as spoken
   - The correct form
   - A brief grammar explanation in Russian (2–3 sentences): why the student's phrase was wrong, which tense or rule applies (name it, e.g. Past Simple, Present Perfect, third person -s), and why the correction is correct
   - **error_category** — exactly ONE id from the fixed catalog below (reuse the same id when the same rule applies across lessons; do not invent new ids):
     third_person_singular | noun_plural | verb_preposition | tense_agreement | past_simple | present_perfect | conditionals | question_formation | possessive | articles | comparatives | gerunds_infinitives | much_many | word_order | fillers_coherence | modals | other

2. **Vocabulary level** — Rate the student's vocabulary range using the CEFR scale:
   A1 (Beginner) | A2 (Elementary) | B1 (Intermediate) | B2 (Upper-Intermediate) | C1 (Advanced) | C2 (Proficient)

3. **Fluency score** — Rate overall spoken fluency from 0.0 to 10.0:
   - 0–3: Very basic, many pauses and errors
   - 4–6: Functional but with noticeable gaps
   - 7–8: Comfortable, occasional errors
   - 9–10: Near-native or native fluency
   If a speaking rubric is provided in a separate system block, follow its fluency band and mapping instead of this generic scale.

4. **Weak topics** — List grammar or language topics the student struggles with
   (e.g., "third conditional", "article usage", "phrasal verbs", "past perfect")

5. **Recommendations** — Provide 3–5 concrete, actionable study suggestions tailored to the student's weaknesses and stated learning goal (if provided).

When a learning goal is provided, frame weak_topics and recommendations as steps toward that goal.
Compare the student's current level against the goal (e.g. B2 discussion skills) where relevant.

Be constructive and specific. If the transcript is very short, note that the analysis may be limited.\
"""


def _build_system_blocks(course_level: str | None) -> list[dict]:
    blocks: list[dict] = [
        {
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }
    ]
    if course_level:
        rubric_prompt = get_rubric_prompt(course_level)
        if rubric_prompt:
            blocks.append(
                {
                    "type": "text",
                    "text": rubric_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            )
    return blocks


def _build_student_context(student_name: str, student_email: str) -> str:
    profile = get_student_profile(student_email)
    display_name = profile["display_name"] if profile else student_name or "Unknown"
    aliases = profile["name_aliases"] if profile else _default_name_aliases(student_name)

    alias_list = ", ".join(f'"{a}"' for a in aliases)
    lines = [
        "## Lesson context",
        "",
        "**Student to evaluate** (analyze ONLY this person's speech):",
        f"- Name: {display_name}",
    ]
    if student_email:
        lines.append(f"- Email: {student_email}")
    lines.extend(
        [
            f"- Likely speaker labels in the transcript: {alias_list}",
            "",
            "**All other speakers** are the teacher or other participants — ignore their speech.",
        ]
    )

    if profile and profile.get("goal"):
        lines.extend(
            [
                "",
                "**Student's learning goal:**",
                profile["goal"],
                "",
                "Tailor weak_topics and recommendations toward this goal.",
            ]
        )

    if profile and profile.get("course_level"):
        lines.append(f"- Course level (rubric): {profile['course_level'].replace('_', ' ')}")

    lines.extend(["", "## Transcript", ""])
    return "\n".join(lines)


def _default_name_aliases(student_name: str) -> list[str]:
    if not student_name or student_name == "Unknown Student":
        return ["Unknown"]
    parts = student_name.strip().split()
    aliases = [student_name.strip()]
    if parts:
        aliases.append(parts[0])
    return list(dict.fromkeys(aliases))

ANALYSIS_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "grammar_errors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "error": {"type": "string"},
                    "correction": {"type": "string"},
                    "explanation": {"type": "string"},
                    "error_category": {
                        "type": "string",
                        "enum": list(ERROR_CATEGORY_IDS),
                    },
                },
                "required": ["error", "correction", "explanation", "error_category"],
                "additionalProperties": False,
            },
        },
        "vocabulary_level": {"type": "string"},
        "fluency_score": {"type": "number"},
        "weak_topics": {"type": "array", "items": {"type": "string"}},
        "recommendations": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "grammar_errors",
        "vocabulary_level",
        "fluency_score",
        "weak_topics",
        "recommendations",
    ],
    "additionalProperties": False,
}


def analyze_transcript(
    transcript: str,
    *,
    student_name: str = "",
    student_email: str = "",
) -> LessonAnalysis:
    """Send transcript to Claude and return a structured lesson analysis."""
    profile = get_student_profile(student_email)
    course_level = profile.get("course_level") if profile else None
    context = _build_student_context(student_name, student_email)
    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=4096,
        system=_build_system_blocks(course_level),
        messages=[
            {
                "role": "user",
                "content": (
                    "Please analyze the following English lesson transcript "
                    "and return a JSON report.\n\n"
                    f"{context}{transcript}"
                ),
            }
        ],
        output_config={
            "format": {
                "type": "json_schema",
                "schema": ANALYSIS_JSON_SCHEMA,
            }
        },
    )

    text = next(b.text for b in response.content if b.type == "text")
    data = json.loads(text)
    for item in data.get("grammar_errors", []):
        item["error_category"] = normalize_category(item.get("error_category"))
    return LessonAnalysis(**data)
