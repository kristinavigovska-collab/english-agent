import json
import os

import anthropic
from dotenv import load_dotenv

from models.schemas import LessonAnalysis
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

2. **Vocabulary level** — Rate the student's vocabulary range using the CEFR scale:
   A1 (Beginner) | A2 (Elementary) | B1 (Intermediate) | B2 (Upper-Intermediate) | C1 (Advanced) | C2 (Proficient)

3. **Fluency score** — Rate overall spoken fluency from 0.0 to 10.0:
   - 0–3: Very basic, many pauses and errors
   - 4–6: Functional but with noticeable gaps
   - 7–8: Comfortable, occasional errors
   - 9–10: Near-native or native fluency

4. **Weak topics** — List grammar or language topics the student struggles with
   (e.g., "third conditional", "article usage", "phrasal verbs", "past perfect")

5. **Recommendations** — Provide 3–5 concrete, actionable study suggestions tailored to the student's weaknesses and stated learning goal (if provided).

When a learning goal is provided, frame weak_topics and recommendations as steps toward that goal.
Compare the student's current level against the goal (e.g. B2 discussion skills) where relevant.

Be constructive and specific. If the transcript is very short, note that the analysis may be limited.\
"""


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
                },
                "required": ["error", "correction", "explanation"],
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
    context = _build_student_context(student_name, student_email)
    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=4096,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                # Cache the large system prompt — reused on every analysis call
                "cache_control": {"type": "ephemeral"},
            }
        ],
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
    return LessonAnalysis(**data)
