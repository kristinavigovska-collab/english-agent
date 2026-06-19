"""
Quick smoke-test for Recall.ai webhook signature verification.

Starts the local server, sends three requests, checks responses.
Reads RECALL_WEBHOOK_SECRET from .env (must be set to a real whsec_ value).

Usage:
    python scripts/test_webhook_sig.py
"""

import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://localhost:8000"
SECRET = os.getenv("RECALL_WEBHOOK_SECRET", "")

SAMPLE_PAYLOAD = {
    "event": "bot.transcription_complete",
    "data": {
        "bot_id": "test-bot-123",
        "transcript": [{"speaker": "Test", "words": [{"text": "Hello world"}]}],
    },
}


def _sign(msg_id: str, ts: int, body: bytes) -> str:
    raw_secret = SECRET.removeprefix("whsec_")
    key = base64.b64decode(raw_secret)
    content = f"{msg_id}.{ts}.".encode() + body
    digest = hmac.new(key, content, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def post(path: str, body: dict, headers: dict) -> tuple[int, str]:
    raw = json.dumps(body).encode()
    req = urllib.request.Request(
        BASE_URL + path,
        data=raw,
        method="POST",
        headers={"Content-Type": "application/json", **headers},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


def run():
    if not SECRET:
        print("ERROR: RECALL_WEBHOOK_SECRET not set in .env")
        sys.exit(1)

    body = SAMPLE_PAYLOAD
    raw = json.dumps(body).encode()
    msg_id = "msg_test001"
    ts = int(time.time())
    sig = _sign(msg_id, ts, raw)

    results = []

    # 1. Valid signature → should be accepted (200)
    status, resp = post(
        "/webhook/recall",
        body,
        {
            "webhook-id": msg_id,
            "webhook-timestamp": str(ts),
            "webhook-signature": sig,
        },
    )
    ok = status == 200
    results.append(("Valid signature  ", status, "✓" if ok else "✗", resp[:80]))

    # 2. Wrong signature → should be rejected (403)
    status, resp = post(
        "/webhook/recall",
        body,
        {
            "webhook-id": msg_id,
            "webhook-timestamp": str(ts),
            "webhook-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        },
    )
    ok = status == 403
    results.append(("Wrong signature  ", status, "✓" if ok else "✗", resp[:80]))

    # 3. Missing headers → should be rejected (403)
    status, resp = post("/webhook/recall", body, {})
    ok = status == 403
    results.append(("No sig headers   ", status, "✓" if ok else "✗", resp[:80]))

    print("\nWebhook signature verification test")
    print("=" * 50)
    all_pass = True
    for label, status, mark, detail in results:
        print(f"  {mark} {label} → HTTP {status}  {detail}")
        if mark == "✗":
            all_pass = False
    print("=" * 50)
    print("PASS" if all_pass else "FAIL")
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    run()
