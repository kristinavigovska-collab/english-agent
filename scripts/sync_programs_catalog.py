#!/usr/bin/env python3
"""Extract PROGRAM_CATALOG from dashboard.js into data/programs_catalog.json."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS_PATH = ROOT / "static" / "dashboard.js"
OUT_PATH = ROOT / "data" / "programs_catalog.json"


def extract_catalog(js: str) -> list[dict]:
    start = js.find("var PROGRAM_CATALOG = [")
    if start < 0:
        raise RuntimeError("PROGRAM_CATALOG not found in dashboard.js")
    start = js.index("[", start)
    depth = 0
    end = start
    for i in range(start, len(js)):
        ch = js[i]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    block = js[start:end]
    # JS object keys → JSON (unquoted keys, trailing commas)
    block = re.sub(r"(\w+)\s*:", r'"\1":', block)
    block = re.sub(r",\s*]", "]", block)
    block = re.sub(r",\s*}", "}", block)
    return json.loads(block)


def main() -> None:
    js = JS_PATH.read_text(encoding="utf-8")
    catalog = extract_catalog(js)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(catalog)} programs to {OUT_PATH}")


if __name__ == "__main__":
    main()
