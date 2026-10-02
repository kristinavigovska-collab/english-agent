"""Claude analysis of a transcribed 1-minute drill answer ("AI Review")."""
from __future__ import annotations

import json
import logging
import os
from typing import Dict, List, Optional

import anthropic

from services import drill_metrics

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-5-5"
MAX_ISSUES = 10
MAX_STRENGTHS = 4
PART_IDS = ("intro", "main", "examples", "conclusion")
ISSUE_TYPES = ("grammar", "vocabulary", "confidence", "filler")

LANGUAGE_NAMES = {"en": "English", "es": "Spanish", "de": "German", "fr": "French"}
UI_LANGUAGE_NAMES = {"ru": "Russian", "en": "English", "uk": "Ukrainian", "pl": "Polish", "pt": "Brazilian Portuguese"}

SYSTEM_PROMPT = """\
You are an expert speaking coach reviewing a learner's ONE-minute spoken answer to a prompt.
You receive an automatic transcript with every word numbered, plus measured pace/pause/filler data.

Rules:
- The transcript is speech-recognition output. Ignore punctuation, capitalisation and likely recognition slips. Flag only clear learner errors or clearly weak phrasing.
- Refer to words only by their index. "from" and "to" are inclusive word indexes; keep each range as short as possible (usually 1-6 words).
- Issue types: "grammar" (wrong form, tense, article, word order), "vocabulary" (imprecise or unnatural word choice), "confidence" (hedging such as "I think maybe", self-undermining or trailing off), "filler" (discourse fillers the recogniser kept, e.g. "like", "basically", "you know" used as filler; not hesitation sounds already marked).
- "better" is the corrected or stronger wording in the SPOKEN language (not the explanation language). For "filler" use an empty string.
- Write every explanation, note, signal, priority and suggestion in the EXPLANATION language given in the user message, in short plain sentences.
- Report at most {max_issues} issues, ordered by importance, never overlapping. Report 2-{max_strengths} genuine strengths (specific phrases that were strong), never overlapping issues.
- structure.parts must contain exactly these four ids, each once: intro, main, examples, conclusion. status is good, ok or weak. Judge how the answer was organised for a one-minute talk; "suggestion" is a concrete one- or two-sentence skeleton the learner could use next time.
- confidence.score is 0-100 and must reflect the measured data (fillers, long pauses, hedging, self-corrections); "signals" are 2-4 short observations that cite those facts.
- priorities: 1-3 concrete things to work on next, most valuable first.
- Be honest and kind. Do not invent mistakes; if the answer is strong, say so and report fewer issues.
""".format(max_issues=MAX_ISSUES, max_strengths=MAX_STRENGTHS)

REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "from": {"type": "integer"},
                    "to": {"type": "integer"},
                    "type": {"type": "string", "enum": list(ISSUE_TYPES)},
                    "better": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": ["from", "to", "type", "better", "explanation"],
                "additionalProperties": False,
            },
        },
        "strengths": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"from": {"type": "integer"}, "to": {"type": "integer"}, "note": {"type": "string"}},
                "required": ["from", "to", "note"],
                "additionalProperties": False,
            },
        },
        "structure": {
            "type": "object",
            "properties": {
                "parts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string", "enum": list(PART_IDS)},
                            "status": {"type": "string", "enum": ["good", "ok", "weak"]},
                            "note": {"type": "string"},
                        },
                        "required": ["id", "status", "note"],
                        "additionalProperties": False,
                    },
                },
                "suggestion": {"type": "string"},
            },
            "required": ["parts", "suggestion"],
            "additionalProperties": False,
        },
        "confidence": {
            "type": "object",
            "properties": {"score": {"type": "integer"}, "signals": {"type": "array", "items": {"type": "string"}}},
            "required": ["score", "signals"],
            "additionalProperties": False,
        },
        "priorities": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["issues", "strengths", "structure", "confidence", "priorities"],
    "additionalProperties": False,
}

_client: Optional[anthropic.Anthropic] = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"), timeout=60.0)
    return _client


def _numbered(words: List[dict]) -> str:
    return " ".join(f"[{i}]{w['w']}" + ("{filler}" if w.get("filler") else "") for i, w in enumerate(words))


def build_user_message(words: List[dict], metrics: dict, topic: str, language: str, ui_locale: str) -> str:
    pauses = ", ".join(f"{p['dur']}s after word {p['before'] - 1}" for p in metrics.get("pauses", [])) or "none"
    fillers = ", ".join(f"{k} x{v}" for k, v in metrics.get("fillers", {}).items()) or "none"
    return (
        f"SPOKEN language: {LANGUAGE_NAMES.get(language, language)}\n"
        f"EXPLANATION language: {UI_LANGUAGE_NAMES.get(ui_locale, 'English')}\n"
        f"Prompt the learner was answering: {topic or '(free topic)'}\n"
        f"Measured: {metrics.get('wpm', 0)} words/min (comfortable range {metrics['targetWpm'][0]}-{metrics['targetWpm'][1]}); "
        f"pauses of 0.8s or more: {pauses}; hesitation fillers: {fillers}.\n\n"
        f"Transcript (words in [index] order; {{filler}} marks fillers already detected):\n{_numbered(words)}"
    )


def _clean_range(item: dict, n: int) -> Optional[tuple]:
    try:
        a, b = int(item["from"]), int(item["to"])
    except (KeyError, TypeError, ValueError):
        return None
    if a > b:
        a, b = b, a
    if a < 0 or b >= n:
        return None
    return a, b


def finalize(raw: dict, words: List[dict]) -> dict:
    """Validate Claude's output against the real transcript and fold it into the report shape."""
    n = len(words)
    taken = [False] * n
    issues: List[dict] = []
    for item in raw.get("issues", []):
        rng = _clean_range(item, n)
        t = item.get("type")
        if not rng or t not in ISSUE_TYPES or any(taken[rng[0] : rng[1] + 1]):
            continue
        a, b = rng
        if t == "filler":
            if all(w.get("filler") for w in words[a : b + 1]):
                continue
            drill_metrics.flag_filler(words, a, b)
            for k in range(a, b + 1):
                taken[k] = True
            continue
        for k in range(a, b + 1):
            taken[k] = True
        issues.append(
            {
                "from": a,
                "to": b,
                "type": t,
                "original": " ".join(w["w"] for w in words[a : b + 1]).strip(" .,;:!?¿¡\"“”"),
                "better": str(item.get("better", "")).strip(),
                "explanation": str(item.get("explanation", "")).strip(),
            }
        )
        if len(issues) >= MAX_ISSUES:
            break

    strengths: List[dict] = []
    for item in raw.get("strengths", []):
        rng = _clean_range(item, n)
        if not rng or any(taken[rng[0] : rng[1] + 1]):
            continue
        for k in range(rng[0], rng[1] + 1):
            taken[k] = True
        strengths.append({"from": rng[0], "to": rng[1], "note": str(item.get("note", "")).strip()})
        if len(strengths) >= MAX_STRENGTHS:
            break

    by_id: Dict[str, dict] = {p.get("id"): p for p in raw.get("structure", {}).get("parts", [])}
    parts = []
    for pid in PART_IDS:
        p = by_id.get(pid) or {}
        status = p.get("status") if p.get("status") in ("good", "ok", "weak") else "ok"
        parts.append({"id": pid, "status": status, "note": str(p.get("note", "")).strip()})

    conf = raw.get("confidence", {})
    score = max(0, min(100, int(conf.get("score", 50))))
    return {
        "issues": sorted(issues, key=lambda i: i["from"]),
        "strengths": sorted(strengths, key=lambda s: s["from"]),
        "structure": {"parts": parts, "suggestion": str(raw.get("structure", {}).get("suggestion", "")).strip()},
        "confidence": {"score": score, "signals": [str(s) for s in conf.get("signals", [])][:4]},
        "priorities": [str(p) for p in raw.get("priorities", [])][:3],
    }


def analyze(words: List[dict], metrics: dict, topic: str, language: str, ui_locale: str) -> dict:
    """Blocking call; run it in a worker thread. Mutates `words` (extra filler flags)."""
    response = _get_client().messages.create(
        model=os.getenv("DRILL_CLAUDE_MODEL", DEFAULT_MODEL),
        max_tokens=3000,
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": build_user_message(words, metrics, topic, language, ui_locale)}],
        output_config={"format": {"type": "json_schema", "schema": REPORT_SCHEMA}},
    )
    text = next(b.text for b in response.content if b.type == "text")
    return finalize(json.loads(text), words)
