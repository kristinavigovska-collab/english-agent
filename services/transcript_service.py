"""Parse Recall transcript payloads into speaker-labeled plain text."""

from __future__ import annotations

from typing import Any


def format_participant_label(participant: dict[str, Any] | None) -> str:
    if not participant:
        return "Unknown"
    name = (participant.get("name") or "").strip()
    email = (participant.get("email") or "").strip()
    if name and email:
        return f"{name} <{email}>"
    if name:
        return name
    if email:
        return email
    return "Unknown"


def utterance_from_words(words: list[dict[str, Any]] | None) -> str:
    if not words:
        return ""
    parts: list[str] = []
    for word in words:
        if isinstance(word, dict):
            text = word.get("text", "")
        else:
            text = str(word)
        if text:
            parts.append(str(text).strip())
    return " ".join(parts).strip()


def line_from_participant_words(
    participant: dict[str, Any] | None, words: list[dict[str, Any]] | None
) -> str:
    text = utterance_from_words(words)
    if not text:
        return ""
    return f"{format_participant_label(participant)}: {text}"


def parse_download_schema(entries: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        line = line_from_participant_words(
            entry.get("participant"), entry.get("words")
        )
        if line:
            lines.append(line)
    return "\n".join(lines)


def extract_transcript_text(data: dict[str, Any]) -> str:
    """
    Parse transcript content from assorted Recall webhook / API shapes.
    Returns speaker-labeled plain text (may be a single utterance or full call).
    """
    realtime = _extract_realtime_utterance(data)
    if realtime:
        return realtime

    raw = data.get("transcript")
    if not raw:
        return ""

    if isinstance(raw, str):
        return raw.strip()

    if isinstance(raw, list):
        if raw and isinstance(raw[0], dict) and "participant" in raw[0]:
            return parse_download_schema(raw)
        lines: list[str] = []
        for segment in raw:
            if not isinstance(segment, dict):
                continue
            participant = segment.get("participant")
            if participant:
                line = line_from_participant_words(
                    participant, segment.get("words")
                )
            else:
                speaker = segment.get("speaker", "Unknown")
                text = utterance_from_words(segment.get("words"))
                line = f"{speaker}: {text}" if text else ""
            if line:
                lines.append(line)
        return "\n".join(lines)

    if isinstance(raw, dict):
        if "words" in raw or "participant" in raw:
            return line_from_participant_words(
                raw.get("participant"), raw.get("words")
            )
        speakers_by_id = {
            s["id"]: s.get("name", "Unknown")
            for s in raw.get("speakers", [])
            if isinstance(s, dict) and "id" in s
        }
        lines = []
        for seg in raw.get("segments", []):
            if not isinstance(seg, dict):
                continue
            speaker_id = seg.get("speaker_id", "")
            speaker = speakers_by_id.get(speaker_id, speaker_id or "Unknown")
            text = (seg.get("text") or "").strip()
            if not text:
                text = utterance_from_words(seg.get("words"))
            if text:
                lines.append(f"{speaker}: {text}")
        return "\n".join(lines)

    return ""


def _extract_realtime_utterance(data: dict[str, Any]) -> str:
    """transcript.data / nested realtime payload."""
    nested = data.get("data")
    if not isinstance(nested, dict):
        return ""

    if "participant" in nested or "words" in nested:
        return line_from_participant_words(
            nested.get("participant"), nested.get("words")
        )

    inner = nested.get("data")
    if isinstance(inner, dict):
        return line_from_participant_words(
            inner.get("participant"), inner.get("words")
        )

    return ""


def merge_transcripts(existing: str, new: str) -> str:
    """Append new utterances; skip exact duplicate suffix lines."""
    existing = (existing or "").strip()
    new = (new or "").strip()
    if not existing:
        return new
    if not new:
        return existing
    if new in existing:
        return existing
    if existing.endswith(new):
        return existing
    return f"{existing}\n{new}"


def pick_longer_transcript(current: str, incoming: str) -> str:
    current = (current or "").strip()
    incoming = (incoming or "").strip()
    if len(incoming) > len(current):
        return incoming
    return current
