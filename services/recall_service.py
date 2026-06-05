"""Recall.ai API — async transcription and full transcript download."""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

from dotenv import load_dotenv

from services.transcript_service import parse_download_schema

load_dotenv()

logger = logging.getLogger(__name__)

RECALL_REGION = os.getenv("RECALL_REGION", "eu-central-1")
RECALL_API_KEY = os.getenv("RECALL_API_KEY", "")


def is_configured() -> bool:
    return bool(RECALL_API_KEY)


def _base_url() -> str:
    return f"https://{RECALL_REGION}.recall.ai"


def _request(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    if not RECALL_API_KEY:
        raise RuntimeError("RECALL_API_KEY is not set")

    url = f"{_base_url()}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": RECALL_API_KEY,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Recall API {method} {path} failed: {exc.code} {detail}") from exc


def _download_json(url: str) -> Any:
    req = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def create_async_transcript(recording_id: str) -> dict[str, Any]:
    """Start post-meeting transcription (Recall.ai provider, English auto-detect)."""
    return _request(
        "POST",
        f"/api/v1/recording/{recording_id}/create_transcript/",
        {
            "provider": {"recallai_async": {"language_code": "en"}},
            "diarization": {"use_separate_streams_when_available": True},
        },
    )


def get_transcript_download_url(transcript_id: str) -> str | None:
    payload = _request("GET", f"/api/v1/transcript/{transcript_id}/")
    data = payload.get("data") or {}
    if isinstance(data, dict):
        return data.get("download_url")
    return None


def get_transcript_download_url_from_bot(bot_id: str) -> str | None:
    payload = _request("GET", f"/api/v1/bot/{bot_id}/")
    recordings = payload.get("recordings") or []
    for recording in recordings:
        if not isinstance(recording, dict):
            continue
        shortcuts = recording.get("media_shortcuts") or {}
        transcript = shortcuts.get("transcript") or {}
        data = transcript.get("data") or {}
        if isinstance(data, dict) and data.get("download_url"):
            return data["download_url"]
        transcript_id = transcript.get("id")
        if transcript_id:
            url = get_transcript_download_url(transcript_id)
            if url:
                return url
    return None


def fetch_transcript_text_from_download_url(download_url: str) -> str:
    entries = _download_json(download_url)
    if isinstance(entries, list):
        return parse_download_schema(entries)
    if isinstance(entries, dict):
        if "results" in entries and isinstance(entries["results"], list):
            return parse_download_schema(entries["results"])
    return ""


def fetch_full_transcript(
    *,
    bot_id: str | None = None,
    transcript_id: str | None = None,
) -> str:
    """Download the full meeting transcript when transcript.done fires."""
    download_url: str | None = None

    if transcript_id:
        download_url = get_transcript_download_url(transcript_id)
    if not download_url and bot_id:
        download_url = get_transcript_download_url_from_bot(bot_id)

    if not download_url:
        return ""

    text = fetch_transcript_text_from_download_url(download_url)
    logger.info(
        "Downloaded Recall transcript (%s chars) bot=%s transcript=%s",
        len(text),
        bot_id,
        transcript_id,
    )
    return text
