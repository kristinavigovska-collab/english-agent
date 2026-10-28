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
}


# voice "p" = the conversation partner in the trial dialogue. Aura-1 renders a sentence in about a third of a second
# (Aura-2 needs 3-4 s), which is what a spoken exchange needs. Override with DIALOGUE_VOICE_MODEL.
PARTNER_VOICE = {"en": "aura-asteria-en"}


class TtsError(Exception):
    pass


class TtsNotConfigured(TtsError):
    pass


_cache: "OrderedDict[str, bytes]" = OrderedDict()


# "ogg" (Opus) is generated about twice as fast as mp3 and is a quarter of the size, but not every browser plays it.
FORMATS = {
    "mp3": ({"encoding": "mp3"}, "audio/mpeg"),
    "ogg": ({"encoding": "opus", "container": "ogg"}, "audio/ogg"),
}


def clean_format(fmt: Optional[str]) -> str:
    return fmt if fmt in FORMATS else "mp3"


def mime_for(fmt: str) -> str:
    return FORMATS[clean_format(fmt)][1]


def _key(text: str, model: str, fmt: str = "mp3") -> str:
    prefix = model if fmt == "mp3" else f"{model}|{fmt}"
    return hashlib.sha1(f"{prefix}|{text}".encode("utf-8")).hexdigest()


def cached(text: str, model: str, fmt: str = "mp3") -> Optional[bytes]:
    k = _key(text, model, clean_format(fmt))
    if k in _cache:
        _cache.move_to_end(k)
        return _cache[k]
    return None


def supports(language: str) -> bool:
    """Languages that have a natural voice (Polish, for one, does not)."""
    return language in VOICES


def model_for(language: str, voice: str) -> str:
    if voice == "p" and language in PARTNER_VOICE:
        return os.getenv("DIALOGUE_VOICE_MODEL", PARTNER_VOICE[language])
    if voice == "p":
        voice = "b"
    return VOICES.get(language, VOICES["en"]).get(voice, VOICES["en"]["a"]) if language in VOICES else VOICES["en"]["a"]


# A pooled connection the provider has already closed fails once with one of these; the retry opens a fresh one.
RETRYABLE = (httpx.RemoteProtocolError, httpx.ReadError, httpx.WriteError, httpx.ConnectError, httpx.PoolTimeout)

_shared = {"client": None, "loop": None}


def shared_client() -> httpx.AsyncClient:
    import asyncio
    loop = asyncio.get_running_loop()
    if _shared["client"] is None or _shared["loop"] is not loop or _shared["client"].is_closed:
        _shared["client"] = httpx.AsyncClient(timeout=TIMEOUT_SEC, limits=httpx.Limits(max_keepalive_connections=4, keepalive_expiry=60))
        _shared["loop"] = loop
    return _shared["client"]


async def synthesize(text: str, model: str, client: Optional[httpx.AsyncClient] = None, fmt: str = "mp3") -> bytes:
    fmt = clean_format(fmt)
    key = os.getenv("DEEPGRAM_API_KEY")
    if not key:
        raise TtsNotConfigured("DEEPGRAM_API_KEY is not set")
    owns = False
    owns_shared = client is None
    client = client or shared_client()
    try:
        for attempt in (1, 2):
            try:
                resp = await client.post(
                    SPEAK_URL,
                    params={"model": model, **FORMATS[fmt][0]},
                    headers={"Authorization": f"Token {key}", "Content-Type": "application/json"},
                    json={"text": text},
                )
                break
            except RETRYABLE:
                if attempt == 2 or not owns_shared:
                    raise
                _shared["client"] = None
                client = shared_client()
    except httpx.HTTPError as exc:
        logger.warning("Deepgram TTS request failed: %s", type(exc).__name__)
        raise TtsError("provider unreachable") from exc
    finally:
        if owns:
            await client.aclose()
    if resp.status_code != 200 or not resp.content:
        logger.warning("Deepgram TTS returned HTTP %s", resp.status_code)
        raise TtsError(f"provider returned {resp.status_code}")
    k = _key(text, model, fmt)
    _cache[k] = resp.content
    while len(_cache) > CACHE_ITEMS:
        _cache.popitem(last=False)
    return resp.content
