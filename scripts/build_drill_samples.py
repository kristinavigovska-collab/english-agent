#!/usr/bin/env python3
"""Build the static sample reviews shown by "See a sample review" on the website.

For every speaking language x situation it asks Claude for a realistic learner answer, gives it
word timings, then runs the REAL review pipeline once per interface language. The results are
plain JSON files the website loads on demand, so the sample costs nothing at click time.

Usage:  python3 scripts/build_drill_samples.py --topics topics.json --out ../Website-YappiFlow/assets/drill-samples
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from services import drill_analysis_service as svc  # noqa: E402
from services import drill_metrics  # noqa: E402

CONTEXTS = ("interview", "sales", "negotiation", "general")
UI_LOCALES = ("ru", "en", "uk", "pl", "pt")
FILLER_HINTS = {
    "en": '"um", "uh", "like", "you know"',
    "es": '"eh", "este", "o sea", "ehm"',
    "de": '"äh", "ähm", "also", "sozusagen"',
    "pl": '"yyy", "eee", "no wiesz", "znaczy"',
}
TRANSCRIPT_SCHEMA = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
    "additionalProperties": False,
}


def learner_transcript(lang: str, context: str, topic: str) -> str:
    prompt = (
        f"Write what a B1-B2 learner of {svc.LANGUAGE_NAMES[lang]} would actually say out loud in a one-minute spoken answer "
        f"to this question in a {context} situation:\n\"{topic}\"\n\n"
        "Requirements: 95-120 words, one continuous spoken paragraph with NO punctuation and no capital letters except proper nouns "
        "(it is raw speech-recognition output). Make it realistic and imperfect: include 4-6 typical learner mistakes for that language "
        "(wrong tense, article, word order, agreement, preposition), 3-4 hesitation fillers written as separate words "
        f"({FILLER_HINTS[lang]}), exactly one hedge such as \"I think maybe\" in that language, a clear main idea and one concrete example, "
        "but a weak or missing conclusion. Return JSON {\"text\": ...}."
    )
    for attempt in range(3):
        try:
            r = svc._get_client().messages.create(
                model=svc.DEFAULT_MODEL, max_tokens=1500, messages=[{"role": "user", "content": prompt}],
                output_config={"format": {"type": "json_schema", "schema": TRANSCRIPT_SCHEMA}}, **svc._thinking(),
            )
            return " ".join(json.loads(next(b.text for b in r.content if b.type == "text"))["text"].split())
        except Exception as exc:  # retry transient failures
            print("transcript retry", lang, context, type(exc).__name__, flush=True)
            time.sleep(2)
    raise RuntimeError("no transcript")


def timed_words(text: str, seed: int) -> list:
    """Give the transcript plausible word timings with two longer pauses (< 60 s in total)."""
    rng = random.Random(seed)
    tokens = text.split()
    pause_at = {int(len(tokens) * 0.28), int(len(tokens) * 0.66)}
    words, t = [], 0.5
    for i, tok in enumerate(tokens):
        dur = 0.18 + 0.032 * len(tok) + rng.uniform(0, 0.05)
        words.append({"w": tok, "s": round(t, 2), "e": round(t + dur, 2)})
        t += dur + 0.06
        if i + 1 in pause_at:
            t += rng.uniform(1.8, 2.5)
        elif (i + 1) % 14 == 0:
            t += 0.35
    return words


def public(words: list) -> list:
    out = []
    for w in words:
        item = {"w": w["w"], "s": w["s"], "e": w["e"]}
        if w.get("filler"):
            item["filler"] = True
        out.append(item)
    return out


def build_one(lang: str, context: str, topic: str, ui: str, text: str, seed: int) -> dict:
    last = None
    for attempt in range(3):
        try:
            words = timed_words(text, seed)
            drill_metrics.mark_fillers(words, lang)
            duration = round(words[-1]["e"] + 0.4, 1)
            metrics = drill_metrics.compute_metrics(words, duration)
            analysis = svc.analyze(words, metrics, topic, lang, ui, context)
            if not analysis["modelAnswer"]["parts"] or not analysis["expertAnswer"]["parts"]:
                raise ValueError("incomplete review")
            metrics = drill_metrics.compute_metrics(words, duration)
            return {"language": lang, "context": context, "topic": topic, "duration": duration, "sample": True,
                    "words": public(words), **analysis, "metrics": metrics}
        except Exception as exc:
            last = exc
            print("retry", lang, context, ui, type(exc).__name__, str(exc)[:80], flush=True)
            time.sleep(3)
    raise RuntimeError(f"failed {lang}/{context}/{ui}: {last}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--topics", required=True, help="JSON {lang: {context: topic}}")
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()
    topics = json.loads(Path(args.topics).read_text(encoding="utf-8"))
    out = Path(args.out)

    jobs = [(lang, ctx, topics[lang][ctx]) for lang in topics for ctx in CONTEXTS]
    # the same learner answer is reused for every interface language (and across resumed runs)
    cache = out / "_transcripts.json"
    saved = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else {}
    missing = [j for j in jobs if f"{j[0]}-{j[1]}" not in saved]
    with ThreadPoolExecutor(args.workers) as pool:
        for j, text in zip(missing, pool.map(lambda j: learner_transcript(*j), missing)):
            saved[f"{j[0]}-{j[1]}"] = text
    out.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(saved, ensure_ascii=False, indent=1), encoding="utf-8")
    transcripts = [saved[f"{j[0]}-{j[1]}"] for j in jobs]
    print(f"{len(transcripts)} learner answers ready", flush=True)

    tasks = []
    for (lang, ctx, topic), text in zip(jobs, transcripts):
        for ui in UI_LOCALES:
            tasks.append((lang, ctx, topic, ui, text, zlib.crc32(f"{lang}{ctx}".encode()) % 10000))

    def run(task):
        lang, ctx, topic, ui, text, seed = task
        path = out / ui / f"{lang}-{ctx}.json"
        if path.exists():
            return path.name
        data = build_one(lang, ctx, topic, ui, text, seed)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("done", ui, path.name, flush=True)
        return path.name

    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(run, tasks))
    print("ALL DONE", len(tasks), flush=True)


if __name__ == "__main__":
    main()
