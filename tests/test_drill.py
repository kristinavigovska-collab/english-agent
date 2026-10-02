import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import drill
from services import deepgram_service, drill_analysis_service, drill_metrics, drill_rate_limit


def make_words(text, start=0.5, step=0.4):
    words, t = [], start
    for tok in text.split():
        words.append({"w": tok, "s": round(t, 2), "e": round(t + 0.3, 2)})
        t += step
    return words


# ---------- metrics ----------

def test_fillers_phrases_and_singles_counted_by_group():
    words = make_words("So um I think you know it um works")
    drill_metrics.mark_fillers(words, "en")
    assert [w.get("filler", False) for w in words] == [False, True, False, False, True, True, False, True, False]
    assert drill_metrics.count_fillers(words) == {"um": 2, "you know": 1}


def test_adjacent_identical_fillers_are_two():
    words = make_words("um um hello")
    drill_metrics.mark_fillers(words, "en")
    assert drill_metrics.count_fillers(words) == {"um": 2}


def test_pauses_and_wpm():
    words = make_words("one two three four five six", step=0.5)
    words[3]["s"] += 2.0  # 2.0s gap before word 3 (0.2 base gap + 2.0)
    words[3]["e"] += 2.0
    for w in words[4:]:
        w["s"] += 2.0
        w["e"] += 2.0
    m = drill_metrics.compute_metrics(words, duration=10)
    assert len(m["pauses"]) == 1 and m["pauses"][0]["before"] == 3
    assert m["pauses"][0]["dur"] >= 2.0
    assert m["wpm"] > 0 and m["targetWpm"] == [120, 160]
    assert m["wpmSeries"][0]["from"] == 0.0


def test_fillers_do_not_count_toward_wpm():
    plain = make_words("alpha beta gamma delta epsilon zeta")
    with_um = make_words("alpha um beta gamma delta epsilon zeta")
    drill_metrics.mark_fillers(with_um, "en")
    # same six spoken words over a slightly longer span: the filler must not inflate pace
    assert drill_metrics.compute_metrics(with_um)["wpm"] <= drill_metrics.compute_metrics(plain)["wpm"]
    assert drill_metrics.count_fillers(with_um) == {"um": 1}


# ---------- finalize ----------

def base_raw(**over):
    raw = {
        "headline": "Clear idea, needs specifics",
        "on_topic": "yes",
        "issues": [],
        "rewrites": [],
        "strengths": [],
        "structure": {"intro_end": -1, "conclusion_start": -1, "has_position": True, "has_reason": True,
                      "has_example": False, "has_conclusion": False, "note": "n"},
        "fillers_note": "f", "hedges_note": "h", "next_step": "step",
    }
    raw.update(over)
    return raw


def test_finalize_routes_issue_types_and_validates_ranges():
    words = make_words("I am walking to school yesterday and uh like it maybe works")
    drill_metrics.mark_fillers(words, "en")
    raw = base_raw(
        issues=[
            {"from": 1, "to": 2, "type": "grammar", "kind": "tense", "better": "walked", "rule": "past"},
            {"from": 2, "to": 3, "type": "grammar", "kind": "form", "better": "x", "rule": "overlaps"},   # overlap -> dropped
            {"from": 40, "to": 41, "type": "grammar", "kind": "form", "better": "x", "rule": "oob"},       # out of range -> dropped
            {"from": 4, "to": 4, "type": "bogus", "kind": "form", "better": "x", "rule": "bad type"},      # unknown type -> dropped
            {"from": 8, "to": 8, "type": "filler", "kind": "other", "better": "", "rule": "like"},         # becomes a filler flag
            {"from": 10, "to": 10, "type": "hedge", "kind": "other", "better": "", "rule": "weakens"},     # goes to hedges
            {"from": 3, "to": 3, "type": "grammar", "kind": "not-a-kind", "better": "z", "rule": "r"},     # kind falls back to other
        ],
        strengths=[{"from": 0, "to": 0, "note": "ok"}, {"from": 1, "to": 1, "note": "overlap"}],
        rewrites=[{"from": 0, "to": 5, "better": "Yesterday I walked to school.", "reason": "clearer"},
                  {"from": 3, "to": 99, "better": "bad", "reason": "oob"}],
    )
    out = drill_analysis_service.finalize(raw, words)
    assert [(i["from"], i["to"], i["original"], i["kind"]) for i in out["issues"]] == [(1, 2, "am walking", "tense"), (3, 3, "to", "other")]
    assert words[8].get("filler") is True
    assert [(h["from"], h["original"]) for h in out["hedges"]] == [(10, "maybe")]
    assert out["strengths"] == [{"from": 0, "to": 0, "note": "ok"}]
    assert len(out["rewrites"]) == 1 and out["rewrites"][0]["original"].startswith("I am walking")
    assert out["headline"] and out["onTopic"] == "yes" and out["nextStep"] == "step"


def test_structure_shares_sum_to_100_and_ignore_bad_indexes():
    words = make_words("one two three four five six seven eight nine ten", step=1.0)
    raw = base_raw(structure={"intro_end": 1, "conclusion_start": 8, "has_position": True, "has_reason": True,
                              "has_example": True, "has_conclusion": True, "note": "n"})
    st = drill_analysis_service.finalize(raw, words)["structure"]
    assert st["introPct"] > 0 and st["endPct"] > 0 and st["introPct"] + st["mainPct"] + st["endPct"] == 100
    assert st["has"] == {"position": True, "reason": True, "example": True, "conclusion": True}
    bad = base_raw(structure={"intro_end": 500, "conclusion_start": -1, "has_position": False, "has_reason": False,
                              "has_example": False, "has_conclusion": False, "note": ""})
    st = drill_analysis_service.finalize(bad, make_words("a b c d e f"))["structure"]
    assert (st["introPct"], st["mainPct"], st["endPct"]) == (0, 100, 0)


def test_deepgram_parse_response():
    payload = {
        "metadata": {"duration": 12.5},
        "results": {"channels": [{"alternatives": [{"words": [
            {"word": "hello", "punctuated_word": "Hello,", "start": 0.1, "end": 0.5, "confidence": 0.99},
            {"word": "um", "start": 0.7, "end": 0.9, "confidence": 0.8},
        ]}]}]},
    }
    words, dur = deepgram_service.parse_response(payload)
    assert dur == 12.5 and [w["w"] for w in words] == ["Hello,", "um"]
    with pytest.raises(deepgram_service.SttError):
        deepgram_service.parse_response({"results": {}})


# ---------- endpoint ----------

@pytest.fixture
def client(monkeypatch):
    drill_rate_limit.reset()
    monkeypatch.delenv("DRILL_DISABLE_LIMIT", raising=False)
    app = FastAPI()
    app.include_router(drill.router, prefix="/api")
    return TestClient(app)


GOOD_TEXT = "So um I think the most important thing is you need to download the map on your phone before you travel anywhere"


def fake_stt(text, step=0.5):
    async def _t(audio, content_type, language, client=None):
        return make_words(text, step=step), 20.0
    return _t


def fake_analysis(words, metrics, topic, language, ui_locale):
    return drill_analysis_service.finalize(
        base_raw(issues=[{"from": 2, "to": 3, "type": "hedge", "kind": "other", "better": "The key thing", "rule": "hedge"}]),
        words,
    )


def post(client, data=b"x" * 5000, ctype="audio/webm;codecs=opus", **form):
    return client.post("/api/drill/analyze", files={"audio": ("a.webm", data, ctype)}, data={"language": "en", "topic": "T", "ui_locale": "ru", **form})


def test_happy_path(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt(GOOD_TEXT))
    monkeypatch.setattr(drill_analysis_service, "analyze", fake_analysis)
    r = post(client)
    assert r.status_code == 200
    body = r.json()
    assert body["topic"] == "T" and body["words"][1]["filler"] is True
    assert body["hedges"][0]["original"] == "I think"
    assert body["headline"] and body["structure"]["mainPct"] == 100
    assert {"wpm", "pauses", "fillers", "wpmSeries", "targetWpm", "pauseRatio", "longPauses"} <= set(body["metrics"])
    assert "audio" not in body


def test_validation_errors(client):
    assert post(client, language="xx").status_code == 400
    assert post(client, ctype="text/plain").json()["detail"]["code"] == "bad_audio"
    assert post(client, data=b"x" * 10).json()["detail"]["code"] == "empty"
    big = post(client, data=b"x" * (drill.MAX_AUDIO_BYTES + 10))
    assert big.status_code == 413


def test_stt_failure_is_refunded(client, monkeypatch):
    async def boom(*a, **k):
        raise deepgram_service.SttError("down")
    monkeypatch.setattr(deepgram_service, "transcribe", boom)
    for _ in range(5):  # never charged, so never rate limited
        assert post(client).json()["detail"]["code"] == "stt_failed"


def test_not_configured(client, monkeypatch):
    async def nokey(*a, **k):
        raise deepgram_service.SttNotConfigured("no key")
    monkeypatch.setattr(deepgram_service, "transcribe", nokey)
    assert post(client).status_code == 503


def test_short_and_empty_speech(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt("hi"))
    assert post(client).json()["detail"]["code"] == "empty"
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt("only a few words here"))
    assert post(client).json()["detail"]["code"] == "too_short"


def test_daily_limit(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt(GOOD_TEXT))
    monkeypatch.setattr(drill_analysis_service, "analyze", fake_analysis)
    monkeypatch.setenv("DRILL_DAILY_LIMIT", "2")
    assert post(client).status_code == 200
    assert post(client).status_code == 200
    r = post(client)
    assert r.status_code == 429 and r.json()["detail"]["code"] == "limit"


def test_analysis_failure_returns_502_and_refunds(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt(GOOD_TEXT))
    def bad(*a, **k):
        raise ValueError("bad json")
    monkeypatch.setattr(drill_analysis_service, "analyze", bad)
    monkeypatch.setenv("DRILL_DAILY_LIMIT", "1")
    assert post(client).json()["detail"]["code"] == "analysis_failed"
    assert post(client).json()["detail"]["code"] == "analysis_failed"  # refunded, so not 429
