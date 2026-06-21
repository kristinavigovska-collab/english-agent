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


def _request(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    *,
    extra_headers: dict[str, str] | None = None,
    use_api_key: bool = True,
) -> Any:
    if use_api_key and not RECALL_API_KEY:
        raise RuntimeError("RECALL_API_KEY is not set")

    url = f"{_base_url()}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers: dict[str, str] = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if use_api_key:
        headers["Authorization"] = RECALL_API_KEY
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers=headers,
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


def extract_lesson_topic_from_webhook(data: dict[str, Any]) -> str:
    """Best-effort title from webhook payload before calling Recall API."""
    metadata = data.get("metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}

    candidates: list[Any] = [
        metadata.get("lesson_topic"),
        metadata.get("event_title"),
        metadata.get("calendar_event_title"),
        metadata.get("meeting_title"),
        metadata.get("title"),
        data.get("lesson_topic"),
        data.get("event_title"),
        data.get("meeting_title"),
        data.get("title"),
    ]

    calendar_meeting = data.get("calendar_meeting")
    if isinstance(calendar_meeting, dict):
        candidates.append(calendar_meeting.get("title"))

    calendar_meetings = data.get("calendar_meetings")
    if isinstance(calendar_meetings, list):
        for meeting in calendar_meetings:
            if isinstance(meeting, dict) and meeting.get("title"):
                candidates.append(meeting.get("title"))
                break

    for value in candidates:
        if isinstance(value, str):
            title = value.strip()
            if title:
                return title
    return ""


def get_bot(bot_id: str) -> dict[str, Any]:
    payload = _request("GET", f"/api/v1/bot/{bot_id}/")
    return payload if isinstance(payload, dict) else {}


def get_calendar_auth_token(user_id: str) -> str:
    payload = _request(
        "POST",
        "/api/v1/calendar/authenticate/",
        {"user_id": user_id},
    )
    if isinstance(payload, dict):
        return str(payload.get("token") or "").strip()
    return ""


def get_calendar_meeting(meeting_id: str, auth_token: str) -> dict[str, Any]:
    payload = _request(
        "GET",
        f"/api/v1/calendar/meetings/{meeting_id}/",
        extra_headers={"x-recallcalendarauthtoken": auth_token},
        use_api_key=False,
    )
    return payload if isinstance(payload, dict) else {}


def _title_from_bot_recordings(bot: dict[str, Any]) -> str:
    for recording in bot.get("recordings") or []:
        if not isinstance(recording, dict):
            continue
        shortcuts = recording.get("media_shortcuts") or {}
        if not isinstance(shortcuts, dict):
            continue
        meta = shortcuts.get("meeting_metadata") or {}
        if not isinstance(meta, dict):
            continue
        data = meta.get("data") or {}
        if not isinstance(data, dict):
            continue
        title = str(data.get("title") or "").strip()
        if title:
            return title
    return ""


def _title_from_calendar_meetings(bot: dict[str, Any]) -> str:
    meetings = bot.get("calendar_meetings") or []
    if not isinstance(meetings, list):
        return ""

    for meeting in meetings:
        if not isinstance(meeting, dict):
            continue
        meeting_id = meeting.get("id")
        calendar_user = meeting.get("calendar_user") or {}
        user_id = ""
        if isinstance(calendar_user, dict):
            user_id = str(calendar_user.get("external_id") or "").strip()
        if not meeting_id or not user_id:
            continue
        try:
            token = get_calendar_auth_token(user_id)
            if not token:
                continue
            payload = get_calendar_meeting(str(meeting_id), token)
            title = str(payload.get("title") or "").strip()
            if title:
                return title
        except Exception:
            logger.exception(
                "Failed to fetch calendar meeting title meeting_id=%s",
                meeting_id,
            )
    return ""


def fetch_lesson_topic(bot_id: str, webhook_data: dict[str, Any] | None = None) -> str:
    """Resolve lesson topic: webhook hints, then Calendar V1 title, then meeting metadata."""
    if webhook_data:
        title = extract_lesson_topic_from_webhook(webhook_data)
        if title:
            return title

    if not bot_id or bot_id == "unknown":
        return ""

    bot = get_bot(bot_id)
    title = _title_from_calendar_meetings(bot)
    if title:
        return title
    return _title_from_bot_recordings(bot)


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
