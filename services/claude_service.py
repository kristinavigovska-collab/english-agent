import json
import os

import anthropic
from dotenv import load_dotenv

from models.schemas import LessonAnalysis

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """\
You are an expert English language coach analyzing a transcript from a student's English lesson.

Your task is to evaluate the STUDENT's English proficiency based solely on their speech in the transcript.
Ignore the teacher's speech entirely — focus only on what the student says.

Analyze the following dimensions:

1. **Grammar errors** — Identify specific grammatical mistakes the student made. For each error, provide:
   - The exact error as spoken
   - The correct form
   - A brief example sentence using the correction

2. **Vocabulary level** — Rate the student's vocabulary range using the CEFR scale:
   A1 (Beginner) | A2 (Elementary) | B1 (Intermediate) | B2 (Upper-Intermediate) | C1 (Advanced) | C2 (Proficient)

3. **Fluency score** — Rate overall spoken fluency from 0.0 to 10.0:
   - 0–3: Very basic, many pauses and errors
   - 4–6: Functional but with noticeable gaps
   - 7–8: Comfortable, occasional errors
   - 9–10: Near-native or native fluency

4. **Weak topics** — List grammar or language topics the student struggles with
   (e.g., "third conditional", "article usage", "phrasal verbs", "past perfect")

5. **Recommendations** — Provide 3–5 concrete, actionable study suggestions tailored to the student's weaknesses.

Be constructive and specific. If the transcript is very short, note that the analysis may be limited.\
"""

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
                    "example": {"type": "string"},
                },
                "required": ["error", "correction", "example"],
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


def analyze_transcript(transcript: str) -> LessonAnalysis:
    """Send transcript to Claude and return a structured lesson analysis."""
    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=2048,
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
                    "and return a JSON report:\n\n"
                    f"{transcript}"
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
