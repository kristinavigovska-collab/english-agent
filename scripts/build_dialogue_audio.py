#!/usr/bin/env python3
"""Pre-record the partner's fixed lines for the website's trial dialogue (the partner voice, English).

The four opening questions per situation and a few short acknowledgements ("Okay.") never change, so the page plays
them from static files: no waiting for speech synthesis and no cost per visitor. Follow-up questions are synthesised live.

Usage:  python3 scripts/build_dialogue_audio.py --site ../Website-YappiFlow
Run it again after editing DIALOGUE_OPENERS in assets/js/drill/dialogue.js (files are numbered by position).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from services import deepgram_tts  # noqa: E402

# Real words only: a synthetic "Mm-hm" comes out as a strange laugh-like sound.
ACKS = ["Okay.", "I see.", "Right.", "Got it."]


def read_lines(site: Path) -> dict:
    """The opening questions, read from the page script itself so there is one source of truth."""
    js = site / "assets" / "js" / "drill" / "dialogue.js"
    code = (
        "global.window = global; global.location = {search: ''};"
        f"require({json.dumps(str(js))});"
        "process.stdout.write(JSON.stringify(YAPPI.DIALOGUE_OPENERS));"
    )
    out = subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True, help="path to the website repository")
    ap.add_argument("--force", action="store_true", help="re-record files that already exist")
    args = ap.parse_args()
    site = Path(args.site).resolve()
    out = site / "assets" / "dialogue-audio" / "en"
    out.mkdir(parents=True, exist_ok=True)
    model = deepgram_tts.model_for("en", "p")

    jobs = []
    for context, lines in read_lines(site).items():
        for i, text in enumerate(lines, 1):
            jobs.append((out / f"{context}-{i}.mp3", text))
    for i, text in enumerate(ACKS, 1):
        jobs.append((out / f"ack-{i}.mp3", text))

    chars = 0
    for path, text in jobs:
        if path.exists() and not args.force:
            continue
        audio = await deepgram_tts.synthesize(text, model)
        path.write_bytes(audio)
        chars += len(text)
        print("recorded", path.name, f"({len(audio) // 1024} KB)", flush=True)
    print(f"{len(jobs)} lines ready, {chars} characters synthesised")


if __name__ == "__main__":
    asyncio.run(main())
