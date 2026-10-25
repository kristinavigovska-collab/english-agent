"""One-word lookup for the website's review pages: translation and a short note for a word in its sentence.

Small model, short answer, cached in memory: repeated clicks on the same word cost nothing.
"""
from __future__ import annotations

import json
import logging
import os
from collections import OrderedDict
from typing import Dict

from services import drill_analysis_service as base

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
CACHE_SIZE = 2000

PROMPT = """\
You are a dictionary for language learners. The user gives one word from a sentence, the sentence, the language of the sentence and the language of the learner.
Answer in the LEARNER's language:
- translation: the meaning of the word AS USED IN THIS SENTENCE, one to three words (the base form if the word is inflected, for example "gave" -> give).
- note: ONE short line, written ENTIRELY in the learner's language (not in the language of the sentence): the part of speech and, if useful, the base form or a usage hint (for example "verb, past of give" or "phrase: used to compare two options"). No more than 14 words.
Never repeat the sentence. If the token is not a real word, return an empty translation.
"""

SCHEMA = {
    "type": "object",
    "properties": {"translation": {"type": "string"}, "note": {"type": "string"}},
    "required": ["translation", "note"],
    "additionalProperties": False,
}

_cache: "OrderedDict[tuple, Dict[str, str]]" = OrderedDict()


def _model() -> str:
    return os.getenv("DRILL_DEFINE_MODEL", DEFAULT_MODEL)


def cached(word: str, sentence: str, language: str, ui_locale: str):
    key = (word.lower(), sentence.lower()[:200], language, ui_locale)
    hit = _cache.get(key)
    if hit is not None:
        _cache.move_to_end(key)
    return hit


def define(word: str, sentence: str, language: str, ui_locale: str) -> Dict[str, str]:
    """Blocking; run in a worker thread. Raises on model failure."""
    key = (word.lower(), sentence.lower()[:200], language, ui_locale)
    hit = cached(word, sentence, language, ui_locale)
    if hit is not None:
        return hit
    user = (
        f"Word: {word}\nSentence: {sentence}\n"
        f"Language of the sentence: {language}\n"
        f"Learner's language: {base.UI_LANGUAGE_NAMES.get(ui_locale, 'English')}"
    )
    response = base._get_client().messages.create(
        model=_model(),
        max_tokens=200,
        system=[{"type": "text", "text": PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user}],
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
    )
    text = next(b.text for b in response.content if b.type == "text")
    raw = json.loads(text)
    out = {"translation": str(raw.get("translation", "")).strip()[:60], "note": str(raw.get("note", "")).strip()[:140]}
    _cache[key] = out
    while len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)
    return out
