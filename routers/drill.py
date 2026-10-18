"""Public endpoint behind the website's 1-minute speaking drill.

POST /api/drill/analyze  (multipart: audio, language, topic, ui_locale, context)
POST /api/drill/dialogue/turn    (multipart: audio, topic, context, turn, total, history)   trial dialogue, English only
POST /api/drill/dialogue/review  (JSON: context, ui_locale, turns)
POST /api/drill/define           (JSON: word, sentence, language, ui_locale)   translation of one word in its sentence
Nothing is stored: the audio and transcript live in memory for the length of the request.
"""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

import json

from services import deepgram_service, deepgram_tts, drill_analysis_service, drill_define_service, drill_dialogue_service, drill_metrics, drill_rate_limit

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
    voice = body.voice if body.voice in ("a", "b", "p") else "a"
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


# ---------------------------------------------------------------- word lookup

MAX_DEFINE_WORD_CHARS = 40
MAX_DEFINE_SENTENCE_CHARS = 300


class DefineRequest(BaseModel):
    word: str = Field(max_length=MAX_DEFINE_WORD_CHARS * 2)
    sentence: str = Field(default="", max_length=MAX_DEFINE_SENTENCE_CHARS * 2)
    language: str = "en"
    ui_locale: str = "en"


@router.post("/drill/define", tags=["drill"])
async def define_word(body: DefineRequest, request: Request):
    """Translation and a short note for one clicked word. Cached; capped per IP per day (cache hits are free)."""
    word = " ".join(body.word.split()).strip(" .,;:!?\"“”()[]")
    sentence = " ".join(body.sentence.split())[:MAX_DEFINE_SENTENCE_CHARS]
    if not word or len(word) > MAX_DEFINE_WORD_CHARS or " " in word:
        return _error(400, "bad_request", "send a single word")
    if body.language not in LANGUAGES or body.ui_locale not in UI_LOCALES:
        return _error(400, "bad_request", "unsupported language")
    hit = drill_define_service.cached(word, sentence, body.language, body.ui_locale)
    if hit is not None:
        return hit
    if not drill_rate_limit.acquire_define(_client_ip(request)):
        return _error(429, "limit", "daily lookup limit reached")
    try:
        return await run_in_threadpool(drill_define_service.define, word, sentence, body.language, body.ui_locale)
    except Exception:
        logger.exception("drill define failed")
        return _error(502, "define_failed", "lookup failed")


# ---------------------------------------------------------------- trial dialogue (English only)

DIALOGUE_LANGUAGE = "en"
DIALOGUE_MIN_WORDS = 5            # answers in a dialogue are shorter than a one-minute monologue
DIALOGUE_MIN_SECONDS = 3.0
MAX_DIALOGUE_QUESTION_CHARS = 300
MAX_DIALOGUE_ANSWER_CHARS = 1500
MAX_DIALOGUE_WORDS = 300          # per answer; a 45 s answer is about 120 words


def _clean_history(raw: str, limit: int) -> List[dict]:
    """The page keeps the conversation; keep only well-formed, size-limited entries."""
    try:
        items = json.loads(raw or "[]")
    except ValueError:
        return []
    out = []
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        q = " ".join(str(it.get("question", "")).split())[:MAX_DIALOGUE_QUESTION_CHARS]
        a = " ".join(str(it.get("answer", "")).split())[:MAX_DIALOGUE_ANSWER_CHARS]
        if q and a:
            out.append({"question": q, "answer": a})
    return out[:limit]


@router.post("/drill/dialogue/turn", tags=["drill"])
async def dialogue_turn(
    request: Request,
    audio: UploadFile = File(...),
    topic: str = Form(""),
    context: str = Form("general"),
    turn: int = Form(1),
    total: int = Form(2),
    history: str = Form("[]"),
):
    """One learner answer: speech-to-text, then (unless it was the last answer) the partner's follow-up question."""
    allowed = drill_dialogue_service.max_answers()
    total = min(allowed, max(drill_dialogue_service.MIN_ANSWERS, total))
    if turn < 1 or turn > total:
        return _error(400, "bad_request", "turn out of range")
    if context not in drill_analysis_service.CONTEXTS:
        context = "general"
    question = " ".join(topic.split())[:MAX_DIALOGUE_QUESTION_CHARS]
    if not question:
        return _error(400, "bad_request", "the partner's question is missing")
    past = _clean_history(history, turn - 1)

    content_type = (audio.content_type or "").split(";")[0].strip().lower()
    if content_type not in AUDIO_TYPES:
        return _error(415, "bad_audio", "unsupported audio type")
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        return _error(413, "bad_audio", "audio is too large")
    if len(data) < 1000:
        return _error(422, "empty", "no audio received")

    ip = _client_ip(request)
    if not drill_rate_limit.acquire_turn(ip, allowed):
        return _error(429, "limit", "daily dialogue limit reached or an answer is already being processed")

    refund = True
    try:
        try:
            words, duration = await deepgram_service.transcribe(data, content_type, DIALOGUE_LANGUAGE)
        except deepgram_service.SttNotConfigured:
            logger.error("drill: DEEPGRAM_API_KEY is not configured")
            return _error(503, "unavailable", "speech recognition is not configured")
        except deepgram_service.SttError:
            return _error(502, "stt_failed", "speech recognition failed")

        if len(words) < MIN_WORDS:
            refund = False
            return _error(422, "empty", "no speech detected")
        if len(words) < DIALOGUE_MIN_WORDS or words[-1]["e"] - words[0]["s"] < DIALOGUE_MIN_SECONDS:
            refund = False
            return _error(422, "too_short", "answer is too short")
        words = words[:MAX_DIALOGUE_WORDS]

        drill_metrics.mark_fillers(words, DIALOGUE_LANGUAGE)
        transcript = " ".join(w["w"] for w in words)
        result = {
            "transcript": transcript,
            "words": _public_words(words),
            "duration": round(max(duration, words[-1]["e"]), 1),
        }
        if turn < total:
            result["question"] = await run_in_threadpool(drill_dialogue_service.next_question, context, past, transcript)
        refund = False
        return result
    finally:
        drill_rate_limit.release_turn(ip, refund=refund)


class DialogueWord(BaseModel):
    w: str = Field(max_length=40)
    s: float = Field(ge=0, le=600)
    e: float = Field(ge=0, le=600)
    filler: bool = False


class DialogueTurn(BaseModel):
    question: str = Field(max_length=MAX_DIALOGUE_QUESTION_CHARS)
    transcript: str = Field("", max_length=MAX_DIALOGUE_ANSWER_CHARS * 2)
    words: List[DialogueWord] = Field(max_length=MAX_DIALOGUE_WORDS)


class DialogueReviewRequest(BaseModel):
    context: str = "general"
    ui_locale: str = "en"
    turns: List[DialogueTurn] = Field(min_length=1, max_length=drill_dialogue_service.MAX_ANSWERS)


@router.post("/drill/dialogue/review", tags=["drill"])
async def dialogue_review(body: DialogueReviewRequest, request: Request):
    """One review of the whole conversation. Counts as one analysis in the daily limit."""
    allowed = drill_dialogue_service.max_answers()
    if len(body.turns) > allowed:
        return _error(400, "bad_request", "too many turns")
    context = body.context if body.context in drill_analysis_service.CONTEXTS else "general"
    ui_locale = body.ui_locale if body.ui_locale in UI_LOCALES else "en"
    turns = []
    for t in body.turns:
        words = [{"w": w.w, "s": w.s, "e": w.e, **({"filler": True} if w.filler else {})} for w in t.words]
        if len(words) < MIN_WORDS:
            return _error(422, "empty", "an answer has no speech")
        turns.append({"question": " ".join(t.question.split()), "transcript": " ".join(t.transcript.split()), "words": words})

    ip = _client_ip(request)
    if not drill_rate_limit.acquire(ip):
        return _error(429, "limit", "daily limit reached or a review is already running")
    refund = True
    try:
        try:
            review = await run_in_threadpool(drill_dialogue_service.review, context, ui_locale, turns)
        except Exception:  # model/JSON/provider failure; details stay out of the response
            logger.exception("drill: dialogue review failed")
            return _error(502, "analysis_failed", "analysis failed")
        refund = False
        return review
    finally:
        drill_rate_limit.release(ip, refund=refund)
