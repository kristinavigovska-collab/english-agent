import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import drill
from services import deepgram_service, deepgram_tts, drill_analysis_service, drill_metrics, drill_rate_limit


def make_words(text, start=0.5, step=0.4):
    words, t = [], start
    for tok in text.split():
        words.append({"w": tok, "s": round(t, 2), "e": round(t + 0.3, 2)})
        t += step
    return words


# ---------- metrics ----------

def test_polish_fillers():
    words = make_words("no wiesz yyy to jest eee dobre")
    drill_metrics.mark_fillers(words, "pl")
    assert drill_metrics.count_fillers(words) == {"no wiesz": 1, "yyy": 1, "eee": 1}


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
    assert m["wpm"] > 0 and m["targetWpm"] == [110, 150]
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
        "structure": {"steps": {sid: {"present": False, "quote": ""} for sid in ("position", "reason", "example", "conclusion")}, "note": "n"},
        "fillers_note": "f", "hedges_note": "h", "next_step": "step",
        "model_answer": {"parts": [{"role": "position", "text": "I would stay home.", "connectors": [], "why": ""}], "tips": ["a"]},
        "expert_answer": {"persona": "Hiring manager", "framework": "STAR", "tips": ["t"], "parts": [
            {"role": "situation", "text": "Last quarter our launch slipped.", "connectors": [], "why": "sets the scene"}]},
        "phrase_bank": [],
        "signposting": {"used": [], "missing": []},
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
    assert out["modelAnswer"] == {"parts": [{"role": "position", "text": "I would stay home.", "connectors": [], "why": ""}], "tips": ["a"]}
    assert out["expertAnswer"]["persona"] == "Hiring manager" and out["expertAnswer"]["framework"] == "STAR"
    assert out["expertAnswer"]["parts"][0]["role"] == "situation" and out["expertAnswer"]["parts"][0]["why"] == "sets the scene"


def test_model_answer_is_sanitised():
    words = make_words("one two three four five six seven eight")
    raw = base_raw(model_answer={
        "parts": [{"role": "bogus", "text": "x", "connectors": [], "why": ""}, {"role": "reason", "text": "  ", "connectors": [], "why": ""}] + [{"role": "example", "text": f"p{i}", "connectors": [], "why": ""} for i in range(9)],
        "tips": ["", "t1", "t2", "t3", "t4"],
    })
    ma = drill_analysis_service.finalize(raw, words)["modelAnswer"]
    assert len(ma["parts"]) == drill_analysis_service.MAX_MODEL_PARTS and ma["parts"][0] == {"role": "example", "text": "p0", "connectors": [], "why": ""}
    assert ma["tips"] == ["t1", "t2", "t3"]
    assert drill_analysis_service.finalize(base_raw(model_answer={}), words)["modelAnswer"] == {"parts": [], "tips": []}


def test_structure_quotes_must_be_in_the_transcript():
    words = make_words("the main reason is simple we save time for example last week we shipped early")
    raw = base_raw(structure={"steps": {
        "position": {"present": False, "quote": ""},
        "reason": {"present": True, "quote": "The main reason is simple!"},          # real quote (case/punctuation ignored)
        "example": {"present": True, "quote": "for example in Lisbon last year"},     # invented -> evidence dropped
        "conclusion": {"present": False, "quote": "ignored when absent"},
    }, "note": "n"})
    st = drill_analysis_service.finalize(raw, words)["structure"]
    assert st["steps"]["reason"] == {"present": True, "quote": "The main reason is simple!"}
    assert st["steps"]["example"] == {"present": True, "quote": ""}
    assert st["steps"]["conclusion"] == {"present": False, "quote": ""}
    assert "introPct" not in st


def test_connectors_phrase_bank_and_signposting_are_validated():
    words = make_words("first of all I think the cost matters for example last year and in short we win")
    raw = base_raw(
        model_answer={"parts": [
            {"role": "position", "text": "The way I see it, cost matters most.", "connectors": [
                {"phrase": "The way I see it,", "function": "argue"},
                {"phrase": "not in the text", "function": "argue"},     # not a substring -> dropped
                {"phrase": "cost", "function": "bogus"},                # unknown function -> dropped
            ]}], "tips": []},
        phrase_bank=[
            {"function": "open", "phrases": ["To begin with,", " ", "First of all,", "Let me start by", "extra"]},
            {"function": "open", "phrases": ["duplicate group"]},       # duplicate function -> dropped
            {"function": "nonsense", "phrases": ["x"]},                  # unknown -> dropped
        ],
        signposting={"used": ["first of all", "for example", "never said this"], "missing": ["contrast", "contrast", "bogus", "soften"]},
    )
    out = drill_analysis_service.finalize(raw, words)
    assert out["modelAnswer"]["parts"][0]["connectors"] == [{"phrase": "The way I see it,", "function": "argue"}]
    assert out["phraseBank"] == [{"function": "open", "phrases": ["To begin with,", "First of all,", "Let me start by"]}]
    assert out["signposting"] == {"used": ["first of all", "for example"], "missing": ["contrast", "soften"]}


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


SEEN = {}


def fake_analysis(words, metrics, topic, language, ui_locale, context="general"):
    SEEN["context"] = context
    return drill_analysis_service.finalize(
        base_raw(issues=[{"from": 2, "to": 3, "type": "hedge", "kind": "other", "better": "The key thing", "rule": "hedge"}]),
        words,
    )


def post(client, data=b"x" * 5000, ctype="audio/webm;codecs=opus", **form):
    return client.post("/api/drill/analyze", files={"audio": ("a.webm", data, ctype)}, data={"language": "en", "topic": "T", "ui_locale": "ru", **form})


def test_context_is_validated_and_passed_on(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt(GOOD_TEXT))
    monkeypatch.setattr(drill_analysis_service, "analyze", fake_analysis)
    monkeypatch.setenv("DRILL_DISABLE_LIMIT", "1")
    assert post(client, context="negotiation").status_code == 200 and SEEN["context"] == "negotiation"
    assert post(client, context="<script>").status_code == 200 and SEEN["context"] == "general"
    body = post(client, context="sales").json()
    assert body["expertAnswer"]["framework"] == "STAR"


def test_happy_path(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt(GOOD_TEXT))
    monkeypatch.setattr(drill_analysis_service, "analyze", fake_analysis)
    r = post(client)
    assert r.status_code == 200
    body = r.json()
    assert body["topic"] == "T" and body["words"][1]["filler"] is True
    assert body["hedges"][0]["original"] == "I think"
    assert body["headline"] and set(body["structure"]["steps"]) == {"position", "reason", "example", "conclusion"}
    assert "phraseBank" in body and "signposting" in body
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


# ---------- text-to-speech ----------

def test_speak_returns_audio_caches_and_validates(client, monkeypatch):
    calls = []

    async def fake_synth(text, model, client=None):
        calls.append(model)
        audio = b"ID3-fake-mp3-bytes"
        deepgram_tts._cache[deepgram_tts._key(text, model)] = audio
        return audio

    deepgram_tts._cache.clear()
    monkeypatch.setattr(deepgram_tts, "synthesize", fake_synth)
    r = client.post("/api/drill/speak", json={"text": "Hello   there, this is a test.", "language": "es", "voice": "b"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content.startswith(b"ID3")
    r2 = client.post("/api/drill/speak", json={"text": "Hello there, this is a test.", "language": "es", "voice": "b"})
    assert r2.status_code == 200 and calls == ["aura-2-nestor-es"]          # second call served from cache
    assert client.post("/api/drill/speak", json={"text": "x" * 2000, "language": "en"}).status_code == 400
    assert client.post("/api/drill/speak", json={"text": "hi", "language": "zz"}).status_code == 400
    no_voice = client.post("/api/drill/speak", json={"text": "Dzień dobry", "language": "pl"})
    assert no_voice.status_code == 400 and no_voice.json()["detail"]["code"] == "no_voice"
    assert deepgram_tts.model_for("de", "a") == "aura-2-julius-de" and deepgram_tts.model_for("xx", "a") == "aura-2-thalia-en"


def test_speak_limit_and_errors(client, monkeypatch):
    deepgram_tts._cache.clear()
    monkeypatch.setenv("DRILL_TTS_DAILY_CHARS", "20")

    async def boom(text, model, client=None):
        raise deepgram_tts.TtsError("down")

    monkeypatch.setattr(deepgram_tts, "synthesize", boom)
    assert client.post("/api/drill/speak", json={"text": "a" * 15, "language": "en"}).json()["detail"]["code"] == "tts_failed"
    r = client.post("/api/drill/speak", json={"text": "b" * 15, "language": "en"})
    assert r.status_code == 429 and r.json()["detail"]["code"] == "limit"
