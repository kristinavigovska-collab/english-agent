"""Public endpoint behind the website's 1-minute speaking drill.

POST /api/drill/analyze  (multipart: audio, language, topic, ui_locale, context)
Nothing is stored: the audio and transcript live in memory for the length of the request.
"""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from services import deepgram_service, deepgram_tts, drill_analysis_service, drill_metrics, drill_rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_TOPIC_CHARS = 200
MIN_WORDS = 3
MIN_WORDS_FOR_REVIEW = 8
MIN_SECONDS_FOR_REVIEW = 8.0
LANGUAGES = {"en", "es", "de", "pl"}
UI_LOCALES = {"ru", "en", "uk", "pl", "pt"}
AUDIO_TYPES = {
    "audio/webm", "video/webm", "audio/mp4", "video/mp4", "audio/x-m4a", "audio/m4a",
    "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac",
}


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": {"code": code, "message": message}})


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/drill/analyze", tags=["drill"])
async def analyze_drill(
    request: Request,
    audio: UploadFile = File(...),
    language: str = Form("en"),
    topic: str = Form(""),
    ui_locale: str = Form("en"),
    context: str = Form("general"),
):
    if language not in LANGUAGES:
        return _error(400, "bad_request", "unsupported language")
    if ui_locale not in UI_LOCALES:
        ui_locale = "en"
    if context not in drill_analysis_service.CONTEXTS:
        context = "general"
    topic = topic.strip()[:MAX_TOPIC_CHARS]

    content_type = (audio.content_type or "").split(";")[0].strip().lower()
    if content_type not in AUDIO_TYPES:
        return _error(415, "bad_audio", "unsupported audio type")
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        return _error(413, "bad_audio", "audio is too large")
    if len(data) < 1000:
        return _error(422, "empty", "no audio received")

    ip = _client_ip(request)
    if not drill_rate_limit.acquire(ip):
        return _error(429, "limit", "daily limit reached or a review is already running")

    refund = True
    try:
        try:
            words, duration = await deepgram_service.transcribe(data, content_type, language)
        except deepgram_service.SttNotConfigured:
            logger.error("drill: DEEPGRAM_API_KEY is not configured")
            return _error(503, "unavailable", "speech recognition is not configured")
        except deepgram_service.SttError:
            return _error(502, "stt_failed", "speech recognition failed")

        if len(words) < MIN_WORDS:
            refund = False
            return _error(422, "empty", "no speech detected")
        spoke_for = words[-1]["e"] - words[0]["s"]
        if len(words) < MIN_WORDS_FOR_REVIEW or spoke_for < MIN_SECONDS_FOR_REVIEW:
            refund = False
            return _error(422, "too_short", "answer is too short to review")

        drill_metrics.mark_fillers(words, language)
        metrics = drill_metrics.compute_metrics(words, duration)
        try:
            analysis = await run_in_threadpool(
                drill_analysis_service.analyze, words, metrics, topic, language, ui_locale, context
            )
        except Exception:  # model/JSON/provider failure; details stay out of the response
            logger.exception("drill: analysis failed")
            return _error(502, "analysis_failed", "analysis failed")

        # The model may have flagged extra fillers; refresh the numbers.
        metrics = drill_metrics.compute_metrics(words, duration)
        refund = False
        return {
            "language": language,
            "topic": topic,
            "duration": round(max(duration, words[-1]["e"]), 1),
            "words": _public_words(words),
            **analysis,
            "metrics": metrics,
        }
    finally:
        drill_rate_limit.release(ip, refund=refund)


def _public_words(words: List[dict]) -> List[dict]:
    out = []
    for w in words:
        item = {"w": w["w"], "s": w["s"], "e": w["e"]}
        if w.get("filler"):
            item["filler"] = True
        out.append(item)
    return out


class SpeakRequest(BaseModel):
    text: str
    language: str = "en"
    voice: str = "a"


@router.post("/drill/speak", tags=["drill"])
async def speak(body: SpeakRequest, request: Request):
    """Natural-voice audio (mp3) for one part of a model answer. Cached; limited per IP by characters per day."""
    text = " ".join(body.text.split())
    if not text or len(text) > deepgram_tts.MAX_TEXT_CHARS:
        return _error(400, "bad_request", "text is empty or too long")
    if body.language not in LANGUAGES:
        return _error(400, "bad_request", "unsupported language")
    if not deepgram_tts.supports(body.language):
        return _error(400, "no_voice", "no natural voice for this language")
    voice = body.voice if body.voice in ("a", "b") else "a"
    model = deepgram_tts.model_for(body.language, voice)

    audio = deepgram_tts.cached(text, model)
    if audio is None:
        if not drill_rate_limit.acquire_tts(_client_ip(request), len(text)):
            return _error(429, "limit", "daily voice limit reached")
        try:
            audio = await deepgram_tts.synthesize(text, model)
        except deepgram_tts.TtsNotConfigured:
            return _error(503, "unavailable", "voice is not configured")
        except deepgram_tts.TtsError:
            return _error(502, "tts_failed", "voice generation failed")
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})
