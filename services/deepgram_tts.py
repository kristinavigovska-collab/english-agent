"""Natural-sounding text-to-speech for the drill's model answers (Deepgram Aura-2)."""
from __future__ import annotations

import hashlib
import logging
import os
from collections import OrderedDict
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

SPEAK_URL = "https://api.deepgram.com/v1/speak"
TIMEOUT_SEC = 45.0
MAX_TEXT_CHARS = 1200
CACHE_ITEMS = 48

# voice "a" = the answer built from the learner's ideas, "b" = the independent expert answer
VOICES = {
    "en": {"a": "aura-2-thalia-en", "b": "aura-2-apollo-en"},
    "es": {"a": "aura-2-celeste-es", "b": "aura-2-nestor-es"},
    "de": {"a": "aura-2-julius-de", "b": "aura-2-viktoria-de"},
    "fr": {"a": "aura-2-agathe-fr", "b": "aura-2-hector-fr"},
}


class TtsError(Exception):
    pass


class TtsNotConfigured(TtsError):
    pass


_cache: "OrderedDict[str, bytes]" = OrderedDict()


def _key(text: str, model: str) -> str:
    return hashlib.sha1(f"{model}|{text}".encode("utf-8")).hexdigest()


def cached(text: str, model: str) -> Optional[bytes]:
    k = _key(text, model)
    if k in _cache:
        _cache.move_to_end(k)
        return _cache[k]
    return None


def model_for(language: str, voice: str) -> str:
    return VOICES.get(language, VOICES["en"]).get(voice, VOICES["en"]["a"]) if language in VOICES else VOICES["en"]["a"]


async def synthesize(text: str, model: str, client: Optional[httpx.AsyncClient] = None) -> bytes:
    key = os.getenv("DEEPGRAM_API_KEY")
    if not key:
        raise TtsNotConfigured("DEEPGRAM_API_KEY is not set")
    owns = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT_SEC)
    try:
        resp = await client.post(
            SPEAK_URL,
            params={"model": model, "encoding": "mp3"},
            headers={"Authorization": f"Token {key}", "Content-Type": "application/json"},
            json={"text": text},
        )
    except httpx.HTTPError as exc:
        logger.warning("Deepgram TTS request failed: %s", type(exc).__name__)
        raise TtsError("provider unreachable") from exc
    finally:
        if owns:
            await client.aclose()
    if resp.status_code != 200 or not resp.content:
        logger.warning("Deepgram TTS returned HTTP %s", resp.status_code)
        raise TtsError(f"provider returned {resp.status_code}")
    k = _key(text, model)
    _cache[k] = resp.content
    while len(_cache) > CACHE_ITEMS:
        _cache.popitem(last=False)
    return resp.content
