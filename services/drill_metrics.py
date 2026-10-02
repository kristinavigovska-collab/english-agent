"""Deterministic speech metrics for the 1-minute drill (no AI involved).

Input is a word list [{"w", "s", "e"}] from the speech recogniser. Everything the
report shows as a number (pace, pauses, filler counts) is computed here, so the
language model never has to guess it.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

PAUSE_MIN_SEC = 0.8
LONG_PAUSE_SEC = 2.0
TARGET_WPM = [120, 160]
SERIES_BUCKET_SEC = 10

# Unambiguous hesitation sounds and discourse fillers per speaking language.
# Words that are only sometimes fillers ("like", "so") are left to the language model.
FILLER_WORDS: Dict[str, set] = {
    "en": {"um", "uh", "uhm", "umm", "er", "erm", "ah", "hmm", "mm", "mhm"},
    "es": {"eh", "em", "ehm", "mm", "hmm", "este", "pues"},
    "de": {"äh", "ähm", "ehm", "öh", "hm", "hmm", "also"},
    "fr": {"euh", "heu", "hum", "ben", "bah", "bref"},
}
FILLER_PHRASES: Dict[str, List[Tuple[str, ...]]] = {
    "en": [("you", "know"), ("i", "mean"), ("sort", "of"), ("kind", "of")],
    "es": [("o", "sea"), ("es", "decir"), ("¿sabes?",)],
    "de": [("sag", "mal"), ("ich", "meine"), ("weißt", "du")],
    "fr": [("tu", "vois"), ("c'est-à-dire",), ("en", "fait")],
}
# "sort of / kind of" are only fillers when they hedge; keep them out of the
# deterministic pass and let the model decide.
_MODEL_DECIDES = {("sort", "of"), ("kind", "of")}

_STRIP = re.compile(r"^[\W_]+|[\W_]+$", re.UNICODE)


def norm(token: str) -> str:
    return _STRIP.sub("", token.lower())


def _next_group(words: List[dict]) -> int:
    return max([w.get("fg", -1) for w in words] + [-1]) + 1


def flag_filler(words: List[dict], start: int, end: int) -> None:
    """Flag words[start..end] (inclusive) as one filler group."""
    g = _next_group(words)
    for k in range(start, end + 1):
        words[k]["filler"] = True
        words[k]["fg"] = g


def mark_fillers(words: List[dict], language: str) -> None:
    """Flag deterministic fillers (hesitation sounds and unambiguous phrases)."""
    singles = FILLER_WORDS.get(language, set())
    phrases = [p for p in FILLER_PHRASES.get(language, []) if p not in _MODEL_DECIDES]
    i = 0
    while i < len(words):
        hit = None
        for ph in phrases:
            n = len(ph)
            if i + n <= len(words) and all(norm(words[i + k]["w"]) == ph[k] for k in range(n)):
                hit = n
                break
        if hit is None and norm(words[i]["w"]) in singles:
            hit = 1
        if hit:
            flag_filler(words, i, i + hit - 1)
            i += hit
        else:
            i += 1


def count_fillers(words: List[dict]) -> Dict[str, int]:
    """Count filler groups by their lowercase text."""
    groups: Dict[int, List[str]] = {}
    for w in words:
        if w.get("filler"):
            groups.setdefault(w.get("fg", -1), []).append(norm(w["w"]))
    counts: Dict[str, int] = {}
    for toks in groups.values():
        key = " ".join(toks)
        counts[key] = counts.get(key, 0) + 1
    return counts


def compute_metrics(words: List[dict], duration: Optional[float] = None) -> dict:
    if not words:
        return {"wpm": 0, "targetWpm": TARGET_WPM, "pauseRatio": 0.0, "pauses": [], "longPauses": 0, "wpmSeries": [], "fillers": {}}
    first_s = words[0]["s"]
    last_e = words[-1]["e"]
    total = max(duration or 0.0, last_e)
    span = max(last_e - first_s, 1.0)
    spoken = len([w for w in words if not w.get("filler")])

    pauses = []
    pause_time = 0.0
    for i in range(1, len(words)):
        gap = words[i]["s"] - words[i - 1]["e"]
        if gap >= PAUSE_MIN_SEC:
            pauses.append({"at": round(words[i - 1]["e"], 1), "dur": round(gap, 1), "before": i})
            pause_time += gap

    series = []
    b = 0.0
    while b < total:
        end = min(b + SERIES_BUCKET_SEC, total)
        n = len([w for w in words if b <= w["s"] < end and not w.get("filler")])
        length = max(end - b, 1.0)
        series.append({"from": round(b, 1), "to": round(end, 1), "wpm": int(round(n * 60.0 / length))})
        b += SERIES_BUCKET_SEC

    return {
        "wpm": int(round(spoken * 60.0 / span)),
        "targetWpm": TARGET_WPM,
        "pauseRatio": round(pause_time / span, 2),
        "pauses": pauses,
        "longPauses": len([p for p in pauses if p["dur"] >= LONG_PAUSE_SEC]),
        "wpmSeries": series,
        "fillers": count_fillers(words),
    }
