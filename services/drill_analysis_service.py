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
ISSUE_TYPES = ("grammar", "vocabulary", "filler", "hedge")
KINDS = ("form", "missing_word", "agreement", "tense", "article", "word_order", "preposition", "word_choice", "other")
ON_TOPIC = ("yes", "partly", "no")
MAX_REWRITES = 2

LANGUAGE_NAMES = {"en": "English", "es": "Spanish", "de": "German", "fr": "French"}
UI_LANGUAGE_NAMES = {"ru": "Russian", "en": "English", "uk": "Ukrainian", "pl": "Polish", "pt": "Brazilian Portuguese"}

SYSTEM_PROMPT = """\
You are an expert speaking coach reviewing a learner's ONE-minute spoken answer to a question.
You receive an automatic transcript with every word numbered, plus measured pace/pause/filler data.

General rules:
- The transcript is speech-recognition output. Ignore punctuation, capitalisation and likely recognition slips; flag only clear learner errors or clearly weak phrasing.
- Refer to words only by their index. "from" and "to" are inclusive word indexes; keep each range as short as possible (usually 1-6 words).
- Write every headline, rule, note and next_step in the EXPLANATION language given in the user message, in short plain sentences. Corrected wording ("better") is always in the SPOKEN language.
- Never mention word indexes, positions or numbers like "word 24" in any text the learner will read; quote the actual words instead.
- Be honest and kind. Do not invent mistakes; if the answer is strong, say so and report fewer items.

Fields:
- headline: a verdict in at most 8 words that names the biggest strength and the biggest gap, e.g. "The idea is clear, but it needs specifics".
- on_topic: "yes", "partly" or "no" - did the answer address the question?
- issues (at most {max_issues}, ordered by importance, never overlapping):
  * "grammar": a wrong form. Set "kind" to the closest of: form, missing_word, agreement, tense, article, word_order, preposition, other. "rule" is one short sentence naming the rule.
  * "vocabulary": an imprecise or unnatural word choice. kind = word_choice.
  * "filler": a discourse filler the recogniser kept that is NOT already marked {{filler}} (for example "actually", "like", "basically", "so" used as filler). better = "".
  * "hedge": softening that weakens a point ("maybe", "I think", "kind of", "sort of"). better = the firm version. rule = why it weakens the point.
  For filler and hedge set kind = "other".
  For grammar and vocabulary, "better" must NEVER be empty: when a word has to be deleted or inserted, widen the range to include a neighbouring word so "better" is a complete replacement phrase (e.g. range "should to" -> better "should"; range "for meeting" with a missing article -> better "for a meeting").
- rewrites (0-{max_rewrites}): rewrite the one or two weakest whole sentences or clauses (from/to cover the original stretch, typically 8-25 words) into a clearer, shorter, stronger version in the spoken language. "reason" is one sentence on why it is better. Rewrites may overlap issues; they are shown separately.
- strengths (1-{max_strengths}): specific phrases that worked, never overlapping issues, with a one-sentence note.
- structure: intro_end = index of the last word of the opening (the learner's framing before the main content), or -1 if there is no real opening; conclusion_start = index of the first word of a closing/summary, or -1 if the answer simply stops. has_position / has_reason / has_example / has_conclusion say whether the answer states a position, gives a reason, gives an example, and ends with a conclusion. "note" is 2-3 sentences quoting a short phrase from the answer.
- fillers_note: 1-2 sentences about the learner's fillers (or praise if there are almost none), citing specific words.
- hedges_note: 1-2 sentences about hedging, citing the phrase, or praise if there is none.
- next_step: ONE concrete thing to try tomorrow, as a single actionable sentence.
""".format(max_issues=MAX_ISSUES, max_rewrites=MAX_REWRITES, max_strengths=MAX_STRENGTHS)

REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "on_topic": {"type": "string", "enum": list(ON_TOPIC)},
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "from": {"type": "integer"},
                    "to": {"type": "integer"},
                    "type": {"type": "string", "enum": list(ISSUE_TYPES)},
                    "kind": {"type": "string", "enum": list(KINDS)},
                    "better": {"type": "string"},
                    "rule": {"type": "string"},
                },
                "required": ["from", "to", "type", "kind", "better", "rule"],
                "additionalProperties": False,
            },
        },
        "rewrites": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "from": {"type": "integer"},
                    "to": {"type": "integer"},
                    "better": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["from", "to", "better", "reason"],
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
                "intro_end": {"type": "integer"},
                "conclusion_start": {"type": "integer"},
                "has_position": {"type": "boolean"},
                "has_reason": {"type": "boolean"},
                "has_example": {"type": "boolean"},
                "has_conclusion": {"type": "boolean"},
                "note": {"type": "string"},
            },
            "required": ["intro_end", "conclusion_start", "has_position", "has_reason", "has_example", "has_conclusion", "note"],
            "additionalProperties": False,
        },
        "fillers_note": {"type": "string"},
        "hedges_note": {"type": "string"},
        "next_step": {"type": "string"},
    },
    "required": ["headline", "on_topic", "issues", "rewrites", "strengths", "structure", "fillers_note", "hedges_note", "next_step"],
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


def _structure_shares(raw: dict, words: List[dict]) -> dict:
    n = len(words)
    first_s, last_e = words[0]["s"], words[-1]["e"]
    span = max(last_e - first_s, 1.0)
    intro_end = raw.get("intro_end", -1)
    concl = raw.get("conclusion_start", -1)
    intro_end = intro_end if isinstance(intro_end, int) and 0 <= intro_end < n - 1 else -1
    concl = concl if isinstance(concl, int) and 0 < concl < n else -1
    if intro_end >= 0 and concl >= 0 and concl <= intro_end:
        concl = -1
    intro = round(100 * (words[intro_end]["e"] - first_s) / span) if intro_end >= 0 else 0
    end = round(100 * (last_e - words[concl]["s"]) / span) if concl >= 0 else 0
    intro, end = max(0, min(intro, 60)), max(0, min(end, 60))
    return {
        "introPct": intro,
        "mainPct": 100 - intro - end,
        "endPct": end,
        "has": {
            "position": bool(raw.get("has_position")),
            "reason": bool(raw.get("has_reason")),
            "example": bool(raw.get("has_example")),
            "conclusion": bool(raw.get("has_conclusion")),
        },
        "note": str(raw.get("note", "")).strip(),
    }


def finalize(raw: dict, words: List[dict]) -> dict:
    """Validate Claude's output against the real transcript and fold it into the report shape."""
    n = len(words)
    taken = [False] * n
    issues: List[dict] = []
    hedges: List[dict] = []
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
        if len(issues) + len(hedges) >= MAX_ISSUES:
            break
        for k in range(a, b + 1):
            taken[k] = True
        original = " ".join(w["w"] for w in words[a : b + 1]).strip(" .,;:!?¿¡\"“”")
        better = str(item.get("better", "")).strip()
        rule = str(item.get("rule", "")).strip()
        if t == "hedge":
            hedges.append({"from": a, "to": b, "original": original, "better": better, "note": rule})
            continue
        kind = item.get("kind") if item.get("kind") in KINDS else "other"
        issues.append({"from": a, "to": b, "type": t, "kind": kind, "original": original, "better": better, "explanation": rule})

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

    rewrites: List[dict] = []
    for item in raw.get("rewrites", []):
        rng = _clean_range(item, n)
        better = str(item.get("better", "")).strip()
        if not rng or not better:
            continue
        rewrites.append(
            {
                "from": rng[0],
                "to": rng[1],
                "original": " ".join(w["w"] for w in words[rng[0] : rng[1] + 1]).strip(" .,;:!?¿¡\"“”"),
                "better": better,
                "reason": str(item.get("reason", "")).strip(),
            }
        )
        if len(rewrites) >= MAX_REWRITES:
            break

    on_topic = raw.get("on_topic") if raw.get("on_topic") in ON_TOPIC else "yes"
    return {
        "headline": str(raw.get("headline", "")).strip(),
        "onTopic": on_topic,
        "issues": sorted(issues, key=lambda i: i["from"]),
        "hedges": sorted(hedges, key=lambda h: h["from"]),
        "rewrites": sorted(rewrites, key=lambda r: r["from"]),
        "strengths": sorted(strengths, key=lambda s: s["from"]),
        "structure": _structure_shares(raw.get("structure", {}), words),
        "fillersNote": str(raw.get("fillers_note", "")).strip(),
        "hedgesNote": str(raw.get("hedges_note", "")).strip(),
        "nextStep": str(raw.get("next_step", "")).strip(),
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
