"""Claude analysis of a transcribed 1-minute drill answer ("AI Review")."""
from __future__ import annotations

import json
import logging
import os
import re
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
MODEL_ROLES = ("intro", "position", "reason", "example", "conclusion", "situation", "action", "result", "lesson",
               "acknowledge", "reframe", "offer", "proof", "ask")
CONTEXTS = ("interview", "sales", "negotiation", "general")
CONTEXT_PERSONAS = {
    "interview": "an experienced international hiring manager who has interviewed hundreds of candidates",
    "sales": "a B2B sales director with 15 years of closing complex deals",
    "negotiation": "a senior commercial negotiator who handles contracts and pricing talks for a global company",
    "general": "a senior manager and communication coach at an international company",
}
MAX_MODEL_PARTS = 6
MAX_MODEL_TIPS = 3
MAX_REWRITES = 2
FUNCTIONS = ("open", "argue", "example", "contrast", "conclude", "soften")
MAX_CONNECTORS_PER_PART = 4
MAX_PHRASE_GROUPS = 6
MAX_PHRASES_PER_GROUP = 3
STEP_IDS = ("position", "reason", "example", "conclusion")

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

Allowed values (anything else is discarded): connector/phrase_bank/signposting functions = open, argue, example, contrast, conclude, soften; part roles = intro, position, reason, example, conclusion, situation, action, result, lesson, acknowledge, reframe, offer, proof, ask; issue kinds = form, missing_word, agreement, tense, article, word_order, preposition, word_choice, other.

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
- structure: for each of position, reason, example and conclusion say whether the answer contains it ("present") and, if it does, copy a SHORT exact quote (3-10 words, word for word from the transcript) as evidence; otherwise quote = "". "note" is 2-3 sentences on how the answer was organised for a one-minute talk.
- fillers_note: 1-2 sentences about the learner's fillers (or praise if there are almost none), citing specific words.
- hedges_note: 1-2 sentences about hedging, citing the phrase, or praise if there is none.
- model_answer: a model answer to the SAME question built ON THE LEARNER'S OWN answer: keep their ideas, examples and good vocabulary, fix their errors, give it a clear shape. About 85-120 words in the SPOKEN language (roughly one minute at a natural pace), natural spoken register, clear structure. Reuse the learner's own ideas, examples and good vocabulary and fix their errors; do not invent unrelated facts. If the learner went off topic, answer the actual question. Split it into "parts", each with a role (intro = one framing sentence, position, reason, example, conclusion). Leave each part's "why" empty and 1-2 sentences of text; include at least position, reason and conclusion. Inside each part, list the "connectors": the linking/signposting phrases you used (copy each one EXACTLY as it appears in that part's text, 1-5 words) with its function: open, argue, example, contrast, conclude or soften. "tips" are 2-3 short notes in the EXPLANATION language on why this version works (structure, firm wording, linking phrases).
- phrase_bank: 4-6 groups of ready-to-use spoken phrases for answering THIS kind of question, each group with a function (open, argue, example, contrast, conclude, soften) and 2-3 natural phrases in the spoken language (e.g. "The way I see it,", "A concrete example is", "That said,", "Bottom line:"). Do not just repeat the connectors of the model answer; offer useful alternatives.
- signposting: "used" = the linking phrases the LEARNER actually used in their answer (copy exactly as in the transcript; empty if none); "missing" = functions from open, argue, example, contrast, conclude, soften that the learner did not signal at all but a strong answer would.
- next_step: ONE concrete thing to try tomorrow, as a single actionable sentence.
""".format(max_issues=MAX_ISSUES, max_rewrites=MAX_REWRITES, max_strengths=MAX_STRENGTHS)

EXPERT_SYSTEM_PROMPT = """\
You are a world-class communication coach who writes model spoken answers that learners study.
You write ONE independent model answer to the question below, exactly as a top professional would say it out loud.

Rules:
- Speak as the PERSONA given in the user message. "persona" is a short label of that expert in the EXPLANATION language (e.g. "Sales director, 15 years in B2B").
- Pick the framework that fits the question type and name it in "framework" (short, in the EXPLANATION language): behavioural or "tell me about a time" -> STAR; opinion or argument -> PREP (point, reason, example, point); price objection or pushback -> acknowledge, reframe the value, offer an option, ask for the next step; self-introduction or "why you" -> who I am, strongest proof, what I want; pitch to an executive -> problem, solution, proof, ask; anything else -> position, reason, example, conclusion.
- Split the answer into "parts". Each part has a "role" from: intro, position, reason, example, conclusion, situation, action, result, lesson, acknowledge, reframe, offer, proof, ask (use the roles that match your framework), 1-2 sentences of "text", and a "why": at most 12 words in the EXPLANATION language saying what that move achieves (e.g. "a number builds trust").
- 100-125 words in total, in the SPOKEN language, natural spoken register with contractions, short sentences, firm verbs, one concrete (plausible, illustrative) detail or number, zero hedging.
- "connectors": for each part, the linking/signposting phrases you used, copied EXACTLY as they appear in the part's text (1-5 words), each with a function from: open, argue, example, contrast, conclude, soften.
- "tips": 2-3 notes in the EXPLANATION language on how this expert thinks and what to copy.
"""

_CONNECTORS = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {"phrase": {"type": "string"}, "function": {"type": "string"}},
        "required": ["phrase", "function"],
        "additionalProperties": False,
    },
}


def _answer_schema(extra: dict) -> dict:
    props = {
        "parts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "role": {"type": "string"},
                    "text": {"type": "string"},
                    "connectors": _CONNECTORS,
                    "why": {"type": "string"},
                },
                "required": ["role", "text", "connectors", "why"],
                "additionalProperties": False,
            },
        },
        "tips": {"type": "array", "items": {"type": "string"}},
    }
    props.update(extra)
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


ANSWER_SCHEMA = _answer_schema({})
EXPERT_SCHEMA = _answer_schema({"persona": {"type": "string"}, "framework": {"type": "string"}})

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
                    "kind": {"type": "string"},
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
                "steps": {
                    "type": "object",
                    "properties": {
                        sid: {
                            "type": "object",
                            "properties": {"present": {"type": "boolean"}, "quote": {"type": "string"}},
                            "required": ["present", "quote"],
                            "additionalProperties": False,
                        }
                        for sid in STEP_IDS
                    },
                    "required": list(STEP_IDS),
                    "additionalProperties": False,
                },
                "note": {"type": "string"},
            },
            "required": ["steps", "note"],
            "additionalProperties": False,
        },
        "fillers_note": {"type": "string"},
        "hedges_note": {"type": "string"},
        "next_step": {"type": "string"},
        "phrase_bank": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"function": {"type": "string"}, "phrases": {"type": "array", "items": {"type": "string"}}},
                "required": ["function", "phrases"],
                "additionalProperties": False,
            },
        },
        "signposting": {
            "type": "object",
            "properties": {
                "used": {"type": "array", "items": {"type": "string"}},
                "missing": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["used", "missing"],
            "additionalProperties": False,
        },
        "model_answer": ANSWER_SCHEMA,
    },
    "required": ["headline", "on_topic", "issues", "rewrites", "strengths", "structure", "fillers_note", "hedges_note", "next_step", "model_answer", "phrase_bank", "signposting"],
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


def build_user_message(words: List[dict], metrics: dict, topic: str, language: str, ui_locale: str, context: str = "general") -> str:
    pauses = ", ".join(f"{p['dur']}s after word {p['before'] - 1}" for p in metrics.get("pauses", [])) or "none"
    fillers = ", ".join(f"{k} x{v}" for k, v in metrics.get("fillers", {}).items()) or "none"
    return (
        f"SPOKEN language: {LANGUAGE_NAMES.get(language, language)}\n"
        f"EXPLANATION language: {UI_LANGUAGE_NAMES.get(ui_locale, 'English')}\n"
        f"Prompt the learner was answering: {topic or '(free topic)'}\n"
        f"Situation: {context}. PERSONA for expert_answer: {CONTEXT_PERSONAS.get(context, CONTEXT_PERSONAS['general'])}.\n"
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


def _norm(text: str) -> str:
    return re.sub(r"[^\w\s']", " ", text.lower()).replace("  ", " ").strip()


def _in_text(phrase: str, haystack_norm: str) -> bool:
    p = " ".join(_norm(phrase).split())
    return bool(p) and p in " ".join(haystack_norm.split())


def _structure(raw: dict, words: List[dict]) -> dict:
    transcript = _norm(" ".join(w["w"] for w in words))
    steps = {}
    for sid in STEP_IDS:
        item = (raw.get("steps") or {}).get(sid) or {}
        quote = str(item.get("quote", "")).strip()
        present = bool(item.get("present"))
        # evidence must really be in the transcript, otherwise we do not claim it
        if present and quote and not _in_text(quote, transcript):
            quote = ""
        steps[sid] = {"present": present, "quote": quote if present else ""}
    return {"steps": steps, "note": str(raw.get("note", "")).strip()}


def _model_answer(raw: dict) -> dict:
    parts = []
    for p in raw.get("parts", []) if isinstance(raw, dict) else []:
        text = str(p.get("text", "")).strip()
        if p.get("role") not in MODEL_ROLES or not text:
            continue
        low = text.lower()
        connectors, seen = [], set()
        for c in p.get("connectors", []) or []:
            phrase = str(c.get("phrase", "")).strip()
            if c.get("function") in FUNCTIONS and phrase and phrase.lower() in low and phrase.lower() not in seen:
                seen.add(phrase.lower())
                connectors.append({"phrase": phrase, "function": c["function"]})
        parts.append({"role": p["role"], "text": text, "connectors": connectors[:MAX_CONNECTORS_PER_PART], "why": str(p.get("why", "")).strip()})
        if len(parts) >= MAX_MODEL_PARTS:
            break
    tips = [str(t).strip() for t in (raw.get("tips", []) if isinstance(raw, dict) else []) if str(t).strip()]
    return {"parts": parts, "tips": tips[:MAX_MODEL_TIPS]}


def _expert_answer(raw: dict) -> dict:
    out = _model_answer(raw)
    out["persona"] = str((raw or {}).get("persona", "")).strip()
    out["framework"] = str((raw or {}).get("framework", "")).strip()
    return out


def _phrase_bank(raw: list) -> list:
    groups, seen = [], set()
    for g in raw or []:
        fn = g.get("function")
        phrases = [str(p).strip() for p in g.get("phrases", []) if str(p).strip()][:MAX_PHRASES_PER_GROUP]
        if fn in FUNCTIONS and fn not in seen and phrases:
            seen.add(fn)
            groups.append({"function": fn, "phrases": phrases})
        if len(groups) >= MAX_PHRASE_GROUPS:
            break
    return groups


def _signposting(raw: dict, words: List[dict]) -> dict:
    transcript = _norm(" ".join(w["w"] for w in words))
    used = [str(u).strip() for u in (raw or {}).get("used", []) if _in_text(str(u), transcript)][:6]
    missing = []
    for fn in (raw or {}).get("missing", []):
        if fn in FUNCTIONS and fn not in missing:
            missing.append(fn)
    return {"used": list(dict.fromkeys(used)), "missing": missing}


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
        "structure": _structure(raw.get("structure", {}), words),
        "fillersNote": str(raw.get("fillers_note", "")).strip(),
        "hedgesNote": str(raw.get("hedges_note", "")).strip(),
        "nextStep": str(raw.get("next_step", "")).strip(),
        "modelAnswer": _model_answer(raw.get("model_answer", {})),
        "expertAnswer": _expert_answer(raw.get("expert_answer", {})),
        "phraseBank": _phrase_bank(raw.get("phrase_bank", [])),
        "signposting": _signposting(raw.get("signposting", {}), words),
    }


def expert_answer(topic: str, language: str, ui_locale: str, context: str) -> dict:
    """Independent model answer written as a domain expert; blocking, run in a worker thread."""
    msg = (
        f"SPOKEN language: {LANGUAGE_NAMES.get(language, language)}\n"
        f"EXPLANATION language: {UI_LANGUAGE_NAMES.get(ui_locale, 'English')}\n"
        f"Situation: {context}. PERSONA: {CONTEXT_PERSONAS.get(context, CONTEXT_PERSONAS['general'])}.\n"
        f"Question: {topic or '(free topic: give a strong one-minute answer about your work)'}"
    )
    response = _get_client().messages.create(
        model=os.getenv("DRILL_CLAUDE_MODEL", DEFAULT_MODEL),
        max_tokens=2500,
        system=[{"type": "text", "text": EXPERT_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": msg}],
        output_config={"format": {"type": "json_schema", "schema": EXPERT_SCHEMA}},
    )
    text = next(b.text for b in response.content if b.type == "text")
    return _expert_answer(json.loads(text))


def analyze(words: List[dict], metrics: dict, topic: str, language: str, ui_locale: str, context: str = "general") -> dict:
    """Blocking call; run it in a worker thread. Mutates `words` (extra filler flags).

    The review of the learner's answer and the independent expert answer are separate model calls
    that run in parallel, so the second one adds no waiting time.
    """
    from concurrent.futures import ThreadPoolExecutor

    def review() -> dict:
        response = _get_client().messages.create(
            model=os.getenv("DRILL_CLAUDE_MODEL", DEFAULT_MODEL),
            max_tokens=7000,
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": build_user_message(words, metrics, topic, language, ui_locale, context)}],
            output_config={"format": {"type": "json_schema", "schema": REPORT_SCHEMA}},
        )
        text = next(b.text for b in response.content if b.type == "text")
        return finalize(json.loads(text), words)

    with ThreadPoolExecutor(max_workers=2) as pool:
        review_future = pool.submit(review)
        expert_future = pool.submit(expert_answer, topic, language, ui_locale, context)
        result = review_future.result()
        try:
            result["expertAnswer"] = expert_future.result()
        except Exception:  # the review is still useful without the second model answer
            logger.exception("drill: expert answer failed")
            result["expertAnswer"] = {"parts": [], "tips": [], "persona": "", "framework": ""}
    return result
