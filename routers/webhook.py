from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from models.schemas import RecallWebhookPayload
from services import claude_service, recall_service, supabase_service
from services.transcript_service import (
    extract_transcript_text,
    merge_transcripts,
    pick_longer_transcript,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Do not run Claude on tiny partial snippets (e.g. "Hello. Glad.")
MIN_TRANSCRIPT_CHARS = 120

_WEBHOOK_TOLERANCE_SECONDS = 300  # reject requests older/newer than 5 minutes


def _verify_recall_signature(request: Request, raw_body: bytes) -> None:
    """Verify Recall.ai webhook signature (Svix HMAC-SHA256).

    If RECALL_WEBHOOK_SECRET is unset, logs a warning and allows through.
    Raises HTTPException(403) on any verification failure.
    """
    secret = os.getenv("RECALL_WEBHOOK_SECRET", "")
    if not secret:
        logger.warning(
            "RECALL_WEBHOOK_SECRET not configured — skipping signature verification"
        )
        return

    # Recall sends Svix-style headers; also accept legacy svix-* names
    msg_id = (
        request.headers.get("webhook-id")
        or request.headers.get("svix-id", "")
    )
    msg_timestamp = (
        request.headers.get("webhook-timestamp")
        or request.headers.get("svix-timestamp", "")
    )
    msg_signature = (
        request.headers.get("webhook-signature")
        or request.headers.get("svix-signature", "")
    )

    if not (msg_id and msg_timestamp and msg_signature):
        raise HTTPException(status_code=403, detail="Missing webhook signature headers")

    # Replay-attack guard: reject if timestamp is > 5 minutes off
    try:
        ts = int(msg_timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Invalid webhook timestamp") from exc

    if abs(int(time.time()) - ts) > _WEBHOOK_TOLERANCE_SECONDS:
        raise HTTPException(status_code=403, detail="Webhook timestamp out of tolerance")

    # Decode the workspace secret (strip optional whsec_ prefix, then base64)
    raw_secret = secret.removeprefix("whsec_")
    try:
        key_bytes = base64.b64decode(raw_secret)
    except Exception as exc:
        logger.exception("RECALL_WEBHOOK_SECRET is not valid base64")
        raise HTTPException(status_code=500, detail="Webhook secret misconfigured") from exc

    # Signed content = "{msg_id}.{timestamp}.{raw_body}"
    signed_content = f"{msg_id}.{msg_timestamp}.".encode() + raw_body
    expected = base64.b64encode(
        hmac.new(key_bytes, signed_content, hashlib.sha256).digest()
    ).decode()

    # Header may contain multiple space-separated "v1,<sig>" entries (during rotation)
    for entry in msg_signature.split(" "):
        if entry.startswith("v1,") and hmac.compare_digest(entry[3:], expected):
            return

    raise HTTPException(status_code=403, detail="Invalid webhook signature")

LEGACY_APPEND_EVENTS = {"bot.transcription"}
LEGACY_FINALIZE_EVENTS = {"bot.transcription_complete", "bot.transcript"}
REALTIME_APPEND_EVENTS = {"transcript.data", "transcript.partial_data"}
FINALIZE_EVENTS = {"transcript.done"} | LEGACY_FINALIZE_EVENTS
RECORDING_EVENTS = {"recording.done"}


def _nested_id(data: dict, *keys: str) -> str:
    for key in keys:
        value = data.get(key)
        if isinstance(value, dict) and value.get("id"):
            return str(value["id"])
        if isinstance(value, str) and value:
            return value
    return ""


def _extract_bot_id(data: dict) -> str:
    return (
        data.get("bot_id")
        or _nested_id(data, "bot")
        or "unknown"
    )


def _extract_recording_id(data: dict) -> str:
    return data.get("recording_id") or _nested_id(data, "recording")


def _extract_transcript_id(data: dict) -> str:
    return data.get("transcript_id") or _nested_id(data, "transcript")


def _extract_student_info(data: dict) -> tuple[str, str]:
    """Return (name, email) from metadata, participants, or transcript speaker."""
    metadata = data.get("metadata") or {}
    name = metadata.get("student_name") or metadata.get("name") or ""
    email = metadata.get("student_email") or metadata.get("email") or ""

    if not email:
        participants = data.get("participants") or []
        for participant in participants:
            if not isinstance(participant, dict):
                continue
            candidate_email = (participant.get("email") or "").strip()
            if candidate_email:
                name = participant.get("name", name) or name
                email = candidate_email
                break

    if not email:
        participant = _extract_non_host_participant(data)
        if participant:
            email = (participant.get("email") or "").strip()
            name = participant.get("name", name) or name

    if not name:
        name = "Unknown Student"

    if not email:
        bot_id = _extract_bot_id(data)
        email = f"{bot_id}@recall.local"

    return name, email


def _extract_non_host_participant(data: dict) -> dict | None:
    nested = data.get("data")
    if isinstance(nested, dict):
        participant = nested.get("participant")
        if isinstance(participant, dict) and not participant.get("is_host"):
            return participant
        inner = nested.get("data")
        if isinstance(inner, dict):
            participant = inner.get("participant")
            if isinstance(participant, dict) and not participant.get("is_host"):
                return participant
    return None


def _analyze_and_save(
    *,
    student: dict,
    lesson: dict,
    transcript: str,
) -> None:
    if len(transcript.strip()) < MIN_TRANSCRIPT_CHARS:
        logger.warning(
            "Transcript too short for analysis (%s chars, lesson %s)",
            len(transcript.strip()),
            lesson["id"],
        )
        return

    analysis = claude_service.analyze_transcript(
        transcript,
        student_name=student.get("name", ""),
        student_email=student.get("email", ""),
    )
    supabase_service.upsert_report_for_lesson(
        student_id=student["id"],
        lesson_id=lesson["id"],
        analysis=analysis,
    )
    logger.info(
        "Report saved for student %s (lesson %s, %s chars)",
        student["id"],
        lesson["id"],
        len(transcript),
    )


def _resolve_lesson_topic(bot_id: str, data: dict) -> str:
    topic = recall_service.extract_lesson_topic_from_webhook(data)
    if topic:
        return topic
    if not recall_service.is_configured() or bot_id == "unknown":
        return ""
    try:
        return recall_service.fetch_lesson_topic(bot_id)
    except Exception:
        logger.exception("Failed to resolve lesson topic for bot %s", bot_id)
        return ""


def _ensure_lesson(
    student: dict,
    bot_id: str,
    transcript: str = "",
    lesson_topic: str = "",
) -> dict:
    return supabase_service.get_or_create_lesson_for_bot(
        student_id=student["id"],
        recall_bot_id=bot_id,
        transcript=transcript,
        lesson_topic=lesson_topic or None,
    )


def _finalize_lesson(bot_id: str, data: dict, transcript: str) -> None:
    transcript = transcript.strip()
    if not transcript:
        logger.warning("Finalize skipped — empty transcript (bot %s)", bot_id)
        return

    name, email = _extract_student_info(data)
    student = supabase_service.get_or_create_student(name, email)
    lesson_topic = _resolve_lesson_topic(bot_id, data)
    lesson = _ensure_lesson(student, bot_id, lesson_topic=lesson_topic)

    existing = (lesson.get("transcript") or "").strip()
    merged = pick_longer_transcript(existing, transcript)
    if merged != existing:
        lesson = supabase_service.update_lesson_transcript(lesson["id"], merged)

    _analyze_and_save(student=student, lesson=lesson, transcript=merged)


def _append_utterance(bot_id: str, data: dict, utterance: str) -> None:
    utterance = utterance.strip()
    if not utterance:
        return

    name, email = _extract_student_info(data)
    student = supabase_service.get_or_create_student(name, email)
    lesson = _ensure_lesson(student, bot_id, transcript="")

    merged = merge_transcripts(lesson.get("transcript") or "", utterance)
    if merged != (lesson.get("transcript") or ""):
        supabase_service.update_lesson_transcript(lesson["id"], merged)
        logger.info(
            "Appended transcript for lesson %s (%s chars total)",
            lesson["id"],
            len(merged),
        )


def _handle_recording_done(data: dict) -> None:
    recording_id = _extract_recording_id(data)
    if not recording_id:
        logger.warning("recording.done without recording id")
        return
    if not recall_service.is_configured():
        logger.warning(
            "RECALL_API_KEY not set — cannot start async transcription for %s",
            recording_id,
        )
        return
    try:
        recall_service.create_async_transcript(recording_id)
        logger.info("Started async transcription for recording %s", recording_id)
    except Exception:
        logger.exception("Failed to create async transcript for %s", recording_id)


def _handle_transcript_done(data: dict) -> None:
    bot_id = _extract_bot_id(data)
    transcript_id = _extract_transcript_id(data)
    transcript = ""

    if recall_service.is_configured():
        try:
            transcript = recall_service.fetch_full_transcript(
                bot_id=bot_id if bot_id != "unknown" else None,
                transcript_id=transcript_id or None,
            )
        except Exception:
            logger.exception(
                "Failed to download Recall transcript bot=%s transcript=%s",
                bot_id,
                transcript_id,
            )

    if not transcript:
        transcript = extract_transcript_text(data)

    _finalize_lesson(bot_id, data, transcript)


def _process_webhook(event: str, data: dict) -> None:
    """Background task: accumulate transcript and analyze when complete."""
    bot_id = _extract_bot_id(data)

    if event in RECORDING_EVENTS:
        _handle_recording_done(data)
        return

    if event in FINALIZE_EVENTS:
        _handle_transcript_done(data)
        return

    if event in REALTIME_APPEND_EVENTS:
        utterance = extract_transcript_text(data)
        _append_utterance(bot_id, data, utterance)
        return

    if event in LEGACY_APPEND_EVENTS:
        utterance = extract_transcript_text(data)
        _append_utterance(bot_id, data, utterance)
        return

    logger.info("Ignored unhandled webhook event: %s", event)


@router.post("/recall")
async def recall_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Receives POST webhooks from Recall.ai.

    Preferred flow:
      recording.done → start async transcription
      transcript.data → append utterances during call
      transcript.done → download full transcript → Claude analysis

    Legacy calendar events (bot.transcription*) are still supported.
    """
    raw_body = await request.body()
    _verify_recall_signature(request, raw_body)

    try:
        body = json.loads(raw_body)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc

    try:
        payload = RecallWebhookPayload(**body)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    handled_events = (
        RECORDING_EVENTS
        | FINALIZE_EVENTS
        | REALTIME_APPEND_EVENTS
        | LEGACY_APPEND_EVENTS
        | LEGACY_FINALIZE_EVENTS
    )

    if payload.event in handled_events:
        background_tasks.add_task(_process_webhook, payload.event, payload.data)
        return {"status": "accepted", "event": payload.event}

    return {"status": "ignored", "event": payload.event}
