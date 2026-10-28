"""Public endpoint behind the website's 1-minute speaking drill.

POST /api/drill/analyze  (multipart: audio, language, topic, ui_locale, context)
POST /api/drill/dialogue/turn    (multipart: audio, topic, context, turn, total, history)   trial dialogue, English only
POST /api/drill/dialogue/review  (JSON: context, ui_locale, turns)
WS   /api/drill/dialogue/live   (live transcription: PCM in, answer + next question out)
POST /api/drill/define           (JSON: word, sentence, language, ui_locale)   translation of one word in its sentence
Nothing is stored: the audio and transcript live in memory for the length of the request.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import time
from typing import List

from fastapi import APIRouter, File, Form, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

import json

from services import deepgram_live, deepgram_service, deepgram_tts, drill_analysis_service, drill_define_service, drill_dialogue_service, drill_metrics, drill_origins, drill_rate_limit

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
    format: str = "mp3"


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

    fmt = deepgram_tts.clean_format(body.format)
    audio = deepgram_tts.cached(text, model, fmt)
    if audio is None:
        if not drill_rate_limit.acquire_tts(_client_ip(request), len(text)):
            return _error(429, "limit", "daily voice limit reached")
        try:
            audio = await deepgram_tts.synthesize(text, model, fmt=fmt)
        except deepgram_tts.TtsNotConfigured:
            return _error(503, "unavailable", "voice is not configured")
        except deepgram_tts.TtsError:
            return _error(502, "tts_failed", "voice generation failed")
    return Response(content=audio, media_type=deepgram_tts.mime_for(fmt), headers={"Cache-Control": "private, max-age=3600"})


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


async def _partner_audio(text: str, fmt: str = "mp3"):
    """The partner's first sentence as base64 audio, or None (the page then asks /speak as before)."""
    fmt = deepgram_tts.clean_format(fmt)
    model = deepgram_tts.model_for(DIALOGUE_LANGUAGE, "p")
    audio = deepgram_tts.cached(text, model, fmt)
    if audio is None:
        try:
            audio = await deepgram_tts.synthesize(text, model, fmt=fmt)
        except deepgram_tts.TtsError:
            return None
    return base64.b64encode(audio).decode("ascii")


async def _keep_voice_warm(fmt: str = "mp3") -> None:
    """While the learner is talking, keep the connections to the voice and language services open and warm:
    a cold or idle-dropped connection costs 1-2 s on the first sentence of the reply. Cancelled when the answer ends."""
    try:
        await _partner_audio("Okay.", fmt)                       # first call opens the voice connection
        await run_in_threadpool(drill_dialogue_service.warm)     # and the language-model connection
        key = os.getenv("DEEPGRAM_API_KEY")
        client = deepgram_tts.shared_client()
        while True:
            await asyncio.sleep(4)
            try:
                await client.get("https://api.deepgram.com/v1/auth/token", headers={"Authorization": f"Token {key}"})   # free ping, same host
            except Exception:
                pass
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.info("drill dialogue keep-warm stopped", exc_info=True)


async def _answer_result(words, duration, context, past, turn, total, t_stt, fmt="mp3"):
    """Shared by the upload endpoint and the live socket: checks the answer, then builds the page's result.
    Returns ((error_response, refund), None) or (None, result)."""
    if len(words) < MIN_WORDS:
        return (_error(422, "empty", "no speech detected"), False), None
    if len(words) < DIALOGUE_MIN_WORDS or words[-1]["e"] - words[0]["s"] < DIALOGUE_MIN_SECONDS:
        return (_error(422, "too_short", "answer is too short"), False), None
    words = words[:MAX_DIALOGUE_WORDS]
    drill_metrics.mark_fillers(words, DIALOGUE_LANGUAGE)
    transcript = " ".join(w["w"] for w in words)
    result = {
        "transcript": transcript,
        "words": _public_words(words),
        "duration": round(max(duration, words[-1]["e"]), 1),
    }
    t_llm = time.perf_counter()
    if turn < total:
        result["question"] = await run_in_threadpool(drill_dialogue_service.next_question, context, past, transcript)
        t_voice = time.perf_counter()
        # The first sentence is voiced here, right after it is written: the page does not need another round trip to start speaking.
        first = drill_dialogue_service.first_chunk(result["question"])
        audio_b64 = await _partner_audio(first, fmt)
        if audio_b64:
            result["questionAudio"] = {"text": first, "audio": audio_b64, "mime": deepgram_tts.mime_for(fmt)}
        llm_ms, voice_ms = round((t_voice - t_llm) * 1000), round((time.perf_counter() - t_voice) * 1000)
    else:
        llm_ms = voice_ms = 0
    result["timing"] = {"stt_ms": round((t_llm - t_stt) * 1000), "next_ms": round((time.perf_counter() - t_llm) * 1000), "llm_ms": llm_ms, "voice_ms": voice_ms}
    logger.info("drill dialogue turn %s/%s timing %s", turn, total, result["timing"])
    return None, result


@router.post("/drill/dialogue/turn", tags=["drill"])
async def dialogue_turn(
    request: Request,
    audio: UploadFile = File(...),
    topic: str = Form(""),
    context: str = Form("general"),
    turn: int = Form(1),
    total: int = Form(2),
    history: str = Form("[]"),
    voice_format: str = Form("mp3"),
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
        t_stt = time.perf_counter()
        try:
            words, duration = await deepgram_service.transcribe(data, content_type, DIALOGUE_LANGUAGE)
        except deepgram_service.SttNotConfigured:
            logger.error("drill: DEEPGRAM_API_KEY is not configured")
            return _error(503, "unavailable", "speech recognition is not configured")
        except deepgram_service.SttError:
            return _error(502, "stt_failed", "speech recognition failed")

        failure, result = await _answer_result(words, duration, context, past, turn, total, t_stt, voice_format)
        if failure is not None:
            refund = failure[1]
            return failure[0]
        refund = False
        return result
    finally:
        drill_rate_limit.release_turn(ip, refund=refund)


# ---- live dialogue: the answer is transcribed while it is being spoken, so the partner can reply at once ----

LIVE_MAX_SECONDS = 70
LIVE_MAX_BYTES = LIVE_MAX_SECONDS * 2 * deepgram_live.SAMPLE_RATE    # 16-bit mono
LIVE_IDLE_SEC = 20


def _ws_ip(ws: WebSocket) -> str:
    fwd = ws.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return ws.client.host if ws.client else "unknown"


@router.websocket("/drill/dialogue/live")
async def dialogue_live(ws: WebSocket):
    """Protocol. Page -> {"type":"start", question, context, turn, total, history}; then binary 16 kHz mono PCM frames;
    then {"type":"end"}. Server -> {"type":"ready"}, later {"type":"result", ...same fields as /dialogue/turn} or {"type":"error","code"}."""
    origin = ws.headers.get("origin")
    if origin is not None and origin not in drill_origins.allowed_origins():
        await ws.close(code=1008)
        return
    await ws.accept()

    async def fail(code: str) -> None:
        try:
            await ws.send_json({"type": "error", "code": code})
            await ws.close()
        except Exception:
            pass

    try:
        start = json.loads(await asyncio.wait_for(ws.receive_text(), 10))
        allowed = drill_dialogue_service.max_answers()
        total = min(allowed, max(drill_dialogue_service.MIN_ANSWERS, int(start.get("total", 2))))
        turn = int(start.get("turn", 1))
        context = start.get("context") or "general"
        question = " ".join(str(start.get("question", "")).split())[:MAX_DIALOGUE_QUESTION_CHARS]
        past = _clean_history(json.dumps(start.get("history", [])), turn - 1)
        fmt = deepgram_tts.clean_format(start.get("format"))
    except (ValueError, TypeError, asyncio.TimeoutError, WebSocketDisconnect, RuntimeError):
        await fail("bad_request")
        return
    if start.get("type") != "start" or turn < 1 or turn > total or not question:
        await fail("bad_request")
        return
    if context not in drill_analysis_service.CONTEXTS:
        context = "general"

    ip = _ws_ip(ws)
    if not drill_rate_limit.acquire_turn(ip, allowed):
        await fail("limit")
        return

    refund = True
    session = None
    warm_task = None
    try:
        def relay(text: str) -> None:
            async def push():
                try:
                    await ws.send_json({"type": "partial", "text": text[-400:]})
                except Exception:
                    pass
            asyncio.get_running_loop().create_task(push())

        session = deepgram_live.LiveSession(DIALOGUE_LANGUAGE, on_partial=relay)
        try:
            await session.open()
        except deepgram_service.SttNotConfigured:
            logger.error("drill: DEEPGRAM_API_KEY is not configured")
            await fail("unavailable")
            return
        except deepgram_service.SttError:
            await fail("stt_failed")
            return
        await ws.send_json({"type": "ready"})
        warm_task = asyncio.create_task(_keep_voice_warm(fmt)) if turn < total else None

        received = 0
        while True:
            msg = await asyncio.wait_for(ws.receive(), LIVE_IDLE_SEC)
            if msg["type"] == "websocket.disconnect":
                return
            if msg.get("bytes") is not None:
                received += len(msg["bytes"])
                if received > LIVE_MAX_BYTES:
                    await fail("too_long")
                    return
                await session.send(msg["bytes"])
            elif msg.get("text") is not None:
                try:
                    if json.loads(msg["text"]).get("type") == "end":
                        break
                except ValueError:
                    pass

        if warm_task is not None:
            warm_task.cancel()
        t_stt = time.perf_counter()
        try:
            words, duration = deepgram_service.parse_response(await session.finish())
        except deepgram_service.SttError:
            await fail("stt_failed")
            return
        failure, result = await _answer_result(words, duration, context, past, turn, total, t_stt, fmt)
        if failure is not None:
            refund = failure[1]
            code = json.loads(failure[0].body)["detail"]["code"]
            await fail(code)
            return
        await ws.send_json({"type": "result", **result})
        refund = False
        await ws.close()
    except asyncio.TimeoutError:
        await fail("timeout")
    except (WebSocketDisconnect, RuntimeError):
        pass
    except deepgram_service.SttError:
        await fail("stt_failed")
    finally:
        if warm_task is not None:
            warm_task.cancel()
        if session is not None:
            await session.close()
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
