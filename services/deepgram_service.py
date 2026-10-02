"""Speech-to-text for the drill via Deepgram's pre-recorded API (word timestamps)."""
from __future__ import annotations

import logging
import os
from typing import List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"
DEFAULT_MODEL = "nova-3"
TIMEOUT_SEC = 45.0


class SttError(Exception):
    """Recognition failed (provider error, bad audio, timeout)."""


class SttNotConfigured(SttError):
    pass


def _params(language: str) -> dict:
    params = {
        "model": os.getenv("DEEPGRAM_MODEL", DEFAULT_MODEL),
        "language": language,
        "punctuate": "true",
        "smart_format": "false",
    }
    if language == "en":
        params["filler_words"] = "true"  # keep "um" / "uh" in the transcript
    return params


def parse_response(payload: dict) -> Tuple[List[dict], float]:
    """Turn a Deepgram response into ([{"w","s","e","c"}], duration_seconds)."""
    try:
        alt = payload["results"]["channels"][0]["alternatives"][0]
    except (KeyError, IndexError, TypeError) as exc:
        raise SttError("unexpected Deepgram response shape") from exc
    words = []
    for item in alt.get("words", []):
        text = item.get("punctuated_word") or item.get("word") or ""
        if not text:
            continue
        words.append(
            {
                "w": text,
                "s": round(float(item.get("start", 0.0)), 2),
                "e": round(float(item.get("end", 0.0)), 2),
                "c": round(float(item.get("confidence", 1.0)), 2),
            }
        )
    duration = float((payload.get("metadata") or {}).get("duration") or 0.0)
    return words, duration


async def transcribe(audio: bytes, content_type: str, language: str, client: Optional[httpx.AsyncClient] = None) -> Tuple[List[dict], float]:
    key = os.getenv("DEEPGRAM_API_KEY")
    if not key:
        raise SttNotConfigured("DEEPGRAM_API_KEY is not set")
    headers = {"Authorization": f"Token {key}", "Content-Type": content_type}
    owns = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT_SEC)
    try:
        resp = await client.post(DEEPGRAM_URL, params=_params(language), headers=headers, content=audio)
    except httpx.HTTPError as exc:
        logger.warning("Deepgram request failed: %s", type(exc).__name__)
        raise SttError("provider unreachable") from exc
    finally:
        if owns:
            await client.aclose()
    if resp.status_code != 200:
        logger.warning("Deepgram returned HTTP %s", resp.status_code)
        raise SttError(f"provider returned {resp.status_code}")
    return parse_response(resp.json())
