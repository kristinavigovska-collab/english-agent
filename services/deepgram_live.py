"""Live (streaming) speech-to-text for the trial dialogue.

The browser streams 16 kHz mono PCM through our WebSocket; this class relays it to Deepgram's live endpoint and
collects the final transcripts, so the text is ready the moment the learner stops talking (no upload + batch
transcription wait). `finish()` returns a payload shaped like the batch response, so the rest of the pipeline is shared.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

import websockets

from services import deepgram_service

logger = logging.getLogger(__name__)

LIVE_URL = "wss://api.deepgram.com/v1/listen"
FINALIZE_WAIT_SEC = 1.5
SAMPLE_RATE = 16000


class LiveSession:
    def __init__(self, language: str = "en", on_partial=None):
        self.language = language
        self._on_partial = on_partial          # called with the text so far (final + the current guess), for the page's turn-taking
        self._ws: Optional[Any] = None
        self._reader: Optional[asyncio.Task] = None
        self._words: List[dict] = []
        self._final_text = ""
        self._flushed = asyncio.Event()
        self._closed = asyncio.Event()
        self.audio_seconds = 0.0

    def _url(self) -> str:
        params = {
            "model": os.getenv("DEEPGRAM_MODEL", deepgram_service.DEFAULT_MODEL),
            "language": self.language,
            "encoding": "linear16",
            "sample_rate": str(SAMPLE_RATE),
            "channels": "1",
            "punctuate": "true",
            "smart_format": "false",
            "interim_results": "true",
        }
        if self.language == "en":
            params["filler_words"] = "true"
        return LIVE_URL + "?" + "&".join(f"{k}={v}" for k, v in params.items())

    async def open(self) -> None:
        key = os.getenv("DEEPGRAM_API_KEY")
        if not key:
            raise deepgram_service.SttNotConfigured("DEEPGRAM_API_KEY is not set")
        try:
            self._ws = await websockets.connect(self._url(), additional_headers={"Authorization": f"Token {key}"}, open_timeout=6, max_size=2 ** 22)
        except Exception as exc:       # network, auth, handshake
            logger.warning("Deepgram live connect failed: %s", type(exc).__name__)
            raise deepgram_service.SttError("provider unreachable") from exc
        self._reader = asyncio.create_task(self._read())

    async def _read(self) -> None:
        try:
            async for raw in self._ws:
                if isinstance(raw, bytes):
                    continue
                try:
                    msg = json.loads(raw)
                except ValueError:
                    continue
                if msg.get("type") != "Results":
                    continue
                alts = (msg.get("channel") or {}).get("alternatives") or [{}]
                if msg.get("is_final"):
                    self._words.extend(alts[0].get("words") or [])
                    self._final_text = (self._final_text + " " + (alts[0].get("transcript") or "")).strip()
                    heard = self._final_text
                else:
                    heard = (self._final_text + " " + (alts[0].get("transcript") or "")).strip()
                if self._on_partial and heard and not msg.get("from_finalize"):
                    try:
                        self._on_partial(heard)
                    except Exception:
                        pass
                if msg.get("from_finalize"):
                    self._flushed.set()
        except Exception as exc:
            logger.info("Deepgram live reader stopped: %s", type(exc).__name__)
        finally:
            self._closed.set()
            self._flushed.set()

    async def send(self, pcm: bytes) -> None:
        if self._ws is None or self._closed.is_set():
            raise deepgram_service.SttError("live connection is closed")
        self.audio_seconds += len(pcm) / (2 * SAMPLE_RATE)
        await self._ws.send(pcm)

    async def finish(self) -> Dict[str, Any]:
        """Flush the last words, close, and return a batch-shaped payload."""
        try:
            if self._ws is not None and not self._closed.is_set():
                await self._ws.send(json.dumps({"type": "Finalize"}))
                try:
                    await asyncio.wait_for(self._flushed.wait(), FINALIZE_WAIT_SEC)
                except asyncio.TimeoutError:
                    logger.info("Deepgram live: no finalize ack, using what is final so far")
                await self._ws.send(json.dumps({"type": "CloseStream"}))
        except Exception as exc:
            logger.info("Deepgram live finish: %s", type(exc).__name__)
        await self.close()
        return {
            "results": {"channels": [{"alternatives": [{"words": list(self._words)}]}]},
            "metadata": {"duration": self.audio_seconds},
        }

    async def close(self) -> None:
        if self._reader is not None:
            self._reader.cancel()
            try:
                await self._reader
            except (asyncio.CancelledError, Exception):
                pass
            self._reader = None
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
