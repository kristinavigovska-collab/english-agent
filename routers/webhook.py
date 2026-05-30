import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from models.schemas import RecallWebhookPayload
from services import claude_service, supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _extract_transcript_text(data: dict) -> str:
    """
    Parse the transcript from a Recall.ai webhook payload.

    Recall.ai sends transcripts in two common shapes:
      1. data.transcript = list of {speaker, words: [{text, ...}]}
      2. data.transcript = {speakers: [...], segments: [{speaker_id, text, ...}]}
    """
    raw = data.get("transcript")
    if not raw:
        return ""

    # Shape 1 — list of speaker/words objects
    if isinstance(raw, list):
        lines = []
        for segment in raw:
            speaker = segment.get("speaker", "Unknown")
            words = segment.get("words", [])
            text = " ".join(w.get("text", "") for w in words).strip()
            if text:
                lines.append(f"{speaker}: {text}")
        return "\n".join(lines)

    # Shape 2 — {speakers, segments}
    if isinstance(raw, dict):
        speakers_by_id = {
            s["id"]: s.get("name", "Unknown")
            for s in raw.get("speakers", [])
        }
        lines = []
        for seg in raw.get("segments", []):
            speaker_id = seg.get("speaker_id", "")
            speaker = speakers_by_id.get(speaker_id, speaker_id or "Unknown")
            text = seg.get("text", "").strip()
            if text:
                lines.append(f"{speaker}: {text}")
        return "\n".join(lines)

    return ""


def _extract_student_info(data: dict) -> tuple[str, str]:
    """Return (name, email) from bot metadata or participant list."""
    metadata = data.get("metadata") or {}
    name = metadata.get("student_name") or metadata.get("name") or "Unknown Student"
    email = metadata.get("student_email") or metadata.get("email") or ""

    # Fall back to first participant if metadata is missing
    if not email:
        participants = data.get("participants") or []
        if participants:
            first = participants[0]
            name = first.get("name", name)
            email = first.get("email", email)

    if not email:
        # Use bot_id as a synthetic identifier so we can still save the record
        bot_id = data.get("bot_id", "unknown")
        email = f"{bot_id}@recall.local"

    return name, email


def _process_webhook(data: dict) -> None:
    """Background task: analyse transcript and persist results."""
    transcript = _extract_transcript_text(data)
    if not transcript:
        logger.warning("Webhook received but transcript is empty — skipping analysis")
        return

    name, email = _extract_student_info(data)
    meeting_id = data.get("bot_id") or data.get("meeting_url") or "unknown"

    try:
        student = supabase_service.get_or_create_student(name, email)
        lesson = supabase_service.create_lesson(
            student_id=student["id"],
            meeting_id=meeting_id,
            transcript=transcript,
        )
        analysis = claude_service.analyze_transcript(transcript)
        supabase_service.save_report(
            student_id=student["id"],
            lesson_id=lesson["id"],
            analysis=analysis,
        )
        logger.info(
            "Report saved for student %s (lesson %s)", student["id"], lesson["id"]
        )
    except Exception:
        logger.exception("Failed to process webhook for meeting %s", meeting_id)


@router.post("/recall")
async def recall_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Receives POST webhooks from Recall.ai.

    Recall.ai sends different event types; we only process transcription events.
    Processing happens in a background task so the endpoint returns 200 immediately.
    """
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc

    try:
        payload = RecallWebhookPayload(**body)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    transcription_events = {
        "bot.transcription",
        "bot.transcript",
        "bot.transcription_complete",
    }

    if payload.event in transcription_events:
        background_tasks.add_task(_process_webhook, payload.data)
        return {"status": "accepted", "event": payload.event}

    # Acknowledge other events without processing them
    return {"status": "ignored", "event": payload.event}
