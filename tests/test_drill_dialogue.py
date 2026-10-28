import json
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import drill
from services import deepgram_service, drill_analysis_service, drill_dialogue_service, drill_rate_limit


def make_words(text, start=0.5, step=0.5):
    words, t = [], start
    for tok in text.split():
        words.append({"w": tok, "s": round(t, 2), "e": round(t + 0.3, 2)})
        t += step
    return words


ANSWER = "well um I think my main strength is that I work with people from different countries for three years"


@pytest.fixture
def client(monkeypatch):
    drill_rate_limit.reset()
    monkeypatch.delenv("DRILL_DISABLE_LIMIT", raising=False)
    monkeypatch.delenv("DIALOGUE_MAX_ANSWERS", raising=False)
    monkeypatch.delenv("DRILL_DIALOGUE_DAILY_TURNS", raising=False)
    app = FastAPI()
    app.include_router(drill.router, prefix="/api")
    return TestClient(app)


def fake_stt(text=ANSWER, step=0.5):
    seen = {}

    async def _t(audio, content_type, language, client=None):
        seen["language"] = language
        return make_words(text, step=step), 20.0

    _t.seen = seen
    return _t


CALLS = {}


def fake_next(context, history, answer):
    CALLS["next"] = {"context": context, "history": history, "answer": answer}
    return "Can you give me a concrete example?"


def turn(client, data=b"x" * 5000, ctype="audio/webm;codecs=opus", **form):
    base = {"topic": "Why should we hire you?", "context": "interview", "turn": "1", "total": "2", "history": "[]"}
    base.update(form)
    return client.post("/api/drill/dialogue/turn", files={"audio": ("a.webm", data, ctype)}, data=base)


# ---------- settings ----------

def test_max_answers_is_clamped(monkeypatch):
    monkeypatch.delenv("DIALOGUE_MAX_ANSWERS", raising=False)
    assert drill_dialogue_service.max_answers() == 2
    monkeypatch.setenv("DIALOGUE_MAX_ANSWERS", "3")
    assert drill_dialogue_service.max_answers() == 3
    monkeypatch.setenv("DIALOGUE_MAX_ANSWERS", "9")
    assert drill_dialogue_service.max_answers() == 3
    monkeypatch.setenv("DIALOGUE_MAX_ANSWERS", "0")
    assert drill_dialogue_service.max_answers() == 2
    monkeypatch.setenv("DIALOGUE_MAX_ANSWERS", "abc")
    assert drill_dialogue_service.max_answers() == 2


# ---------- turn endpoint ----------

def test_first_turn_returns_transcript_and_a_follow_up(client, monkeypatch):
    stt = fake_stt()
    monkeypatch.setattr(deepgram_service, "transcribe", stt)
    monkeypatch.setattr(drill_dialogue_service, "next_question", fake_next)
    r = turn(client, history=json.dumps([]))
    assert r.status_code == 200
    body = r.json()
    assert body["question"] == "Can you give me a concrete example?"
    assert body["transcript"].startswith("well um I think")
    assert body["words"][1]["filler"] is True and "filler" not in body["words"][0]
    assert stt.seen["language"] == "en"            # the dialogue is English only
    assert CALLS["next"]["context"] == "interview" and CALLS["next"]["answer"] == body["transcript"]
    assert "audio" not in body


def test_last_turn_has_no_follow_up_and_carries_the_history(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt())
    called = []
    monkeypatch.setattr(drill_dialogue_service, "next_question", lambda *a: called.append(a) or "x?")
    hist = json.dumps([{"question": "Q1?", "answer": "A1"}])
    r = turn(client, turn="2", total="2", history=hist)
    assert r.status_code == 200
    assert "question" not in r.json() and called == []


def test_follow_up_receives_the_cleaned_history(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt())
    monkeypatch.setattr(drill_dialogue_service, "next_question", fake_next)
    junk = json.dumps([{"question": "Q1?", "answer": "A1"}, "nope", {"question": "", "answer": "x"}, {"question": "Q2?", "answer": "A2"}])
    CALLS.pop("next", None)
    monkeypatch.setenv("DIALOGUE_MAX_ANSWERS", "3")
    r = turn(client, turn="2", total="3", history=junk, topic="Q2?")     # turn 2 of 3: the partner asks again
    assert r.status_code == 200 and "question" in r.json()
    assert CALLS["next"]["history"] == [{"question": "Q1?", "answer": "A1"}]   # only turn-1 entries, junk dropped


def test_total_cannot_exceed_the_site_setting(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt())
    monkeypatch.setattr(drill_dialogue_service, "next_question", fake_next)
    assert turn(client, turn="3", total="9").status_code == 400
    monkeypatch.setenv("DIALOGUE_MAX_ANSWERS", "3")
    assert turn(client, turn="3", total="9").status_code == 200


def test_turn_validation_errors(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt())
    monkeypatch.setattr(drill_dialogue_service, "next_question", fake_next)
    assert turn(client, topic="   ").status_code == 400
    assert turn(client, turn="0").status_code == 400
    assert turn(client, ctype="text/plain").status_code == 415
    assert turn(client, data=b"x" * 10).status_code == 422
    assert turn(client, data=b"x" * (5 * 1024 * 1024 + 10)).status_code == 413
    # an unknown situation falls back to "general"
    assert turn(client, context="weird").status_code == 200
    assert CALLS["next"]["context"] == "general"


def test_short_and_empty_speech_in_a_dialogue(client, monkeypatch):
    monkeypatch.setattr(drill_dialogue_service, "next_question", fake_next)
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt("hello"))
    r = turn(client)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "empty"
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt("yes I think so", step=0.3))
    r = turn(client)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "too_short"


def test_stt_failure_is_refunded(client, monkeypatch):
    monkeypatch.setenv("DRILL_DIALOGUE_DAILY_TURNS", "1")

    async def boom(*a, **k):
        raise deepgram_service.SttError("down")

    monkeypatch.setattr(deepgram_service, "transcribe", boom)
    assert turn(client).status_code == 502
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt())
    monkeypatch.setattr(drill_dialogue_service, "next_question", fake_next)
    assert turn(client).status_code == 200            # the failed attempt did not use the only allowed answer


def test_not_configured(client, monkeypatch):
    async def nokey(*a, **k):
        raise deepgram_service.SttNotConfigured()

    monkeypatch.setattr(deepgram_service, "transcribe", nokey)
    r = turn(client)
    assert r.status_code == 503 and r.json()["detail"]["code"] == "unavailable"


def test_daily_turn_limit(client, monkeypatch):
    monkeypatch.setenv("DRILL_DIALOGUE_DAILY_TURNS", "2")
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt())
    monkeypatch.setattr(drill_dialogue_service, "next_question", fake_next)
    assert turn(client).status_code == 200
    assert turn(client).status_code == 200
    r = turn(client)
    assert r.status_code == 429 and r.json()["detail"]["code"] == "limit"


def test_default_turn_limit_follows_the_daily_analyses(monkeypatch):
    monkeypatch.delenv("DRILL_DIALOGUE_DAILY_TURNS", raising=False)
    monkeypatch.setenv("DRILL_DAILY_LIMIT", "3")
    assert drill_rate_limit.dialogue_daily_turns(2) == 6
    assert drill_rate_limit.dialogue_daily_turns(3) == 9


def test_one_answer_at_a_time_per_ip(monkeypatch):
    monkeypatch.delenv("DRILL_DISABLE_LIMIT", raising=False)
    drill_rate_limit.reset()
    assert drill_rate_limit.acquire_turn("1.1.1.1") is True
    assert drill_rate_limit.acquire_turn("1.1.1.1") is False      # still processing
    drill_rate_limit.release_turn("1.1.1.1")
    assert drill_rate_limit.acquire_turn("1.1.1.1") is True
    assert drill_rate_limit.acquire_turn("2.2.2.2") is True       # another visitor is not blocked
    drill_rate_limit.reset()


# ---------- the partner's follow-up question ----------

def fake_claude(text=None, boom=False):
    def create(**kwargs):
        create.kwargs = kwargs
        if boom:
            raise RuntimeError("provider down")
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)], stop_reason="end_turn")

    return SimpleNamespace(messages=SimpleNamespace(create=create)), create


def test_next_question_is_cleaned_and_uses_the_history(monkeypatch):
    cl, create = fake_claude('"Can you give me a number for that?"\nExtra line')
    monkeypatch.setattr(drill_analysis_service, "_get_client", lambda: cl)
    q = drill_dialogue_service.next_question("sales", [{"question": "Q1?", "answer": "A1"}], "latest answer")
    assert q == "Can you give me a number for that?"
    sent = create.kwargs["messages"][0]["content"]
    assert "Partner: Q1?" in sent and "Learner: A1" in sent and "latest answer" in sent
    assert "busy client" in create.kwargs["system"][0]["text"]
    assert create.kwargs["max_tokens"] <= 200


def test_next_question_falls_back_when_the_model_fails_or_does_not_ask(monkeypatch):
    cl, _ = fake_claude(boom=True)
    monkeypatch.setattr(drill_analysis_service, "_get_client", lambda: cl)
    assert drill_dialogue_service.next_question("negotiation", [], "x") == drill_dialogue_service.FALLBACK_QUESTIONS["negotiation"]
    cl, _ = fake_claude("That sounds great.")
    monkeypatch.setattr(drill_analysis_service, "_get_client", lambda: cl)
    assert drill_dialogue_service.next_question("interview", [], "x") == drill_dialogue_service.FALLBACK_QUESTIONS["interview"]


def test_a_very_long_question_is_shortened_to_whole_sentences():
    text = "Tell me more about that. " * 20 + "And what happened next?"
    out = drill_dialogue_service._clean_question(text)
    assert len(out) <= drill_dialogue_service.MAX_QUESTION_CHARS and out.endswith(".")


# ---------- review ----------

def turns_payload(n=2):
    return [{"question": f"Q{i}?", "transcript": ANSWER, "words": [dict(w) for w in make_words(ANSWER)]} for i in range(1, n + 1)]


EXPERT = {"parts": [{"kind": "position", "text": "I have worked with international teams for three years."}, {"kind": "bogus", "text": "I explain things simply."}, {"kind": "result", "text": "   "}], "why": "Position first, then proof."}


def raw_review(**over):
    base = {
        "headline": "Clear answers, but ask back",
        "turns": [
            {"note": "n1", "issues": [{"from": 12, "to": 16, "better": "have worked with people from different countries for three years", "topic": "Present perfect", "reason": "present perfect", "rule": {"formula": "have been + verb-ing + for", "when": "Use it for actions that continue.", "examples": ["I have lived here for five years.", "  ", "She has been working since May."]}}], "hedges": [{"from": 2, "to": 3}], "expert": EXPERT},
            {"note": "n2", "issues": [], "hedges": [], "expert": EXPERT},
        ],
        "next_step": "Ask one question back.",
    }
    base.update(over)
    return base


def test_finalize_review_keeps_valid_items_and_drops_invalid_ones():
    turns = [{"question": "Q1?", "words": make_words(ANSWER)}, {"question": "Q2?", "words": make_words(ANSWER)}]
    n = len(turns[0]["words"])
    raw = raw_review(turns=[
        {"note": "n1", "issues": [
            {"from": 12, "to": 16, "better": "fixed", "topic": "Present perfect", "reason": "r", "rule": {"formula": "f", "when": "w", "examples": ["e"]}},
            {"from": 14, "to": 15, "better": "overlaps the first", "reason": "r"},       # overlap -> dropped
            {"from": 0, "to": 999, "better": "out of range", "reason": "r"},             # out of range -> dropped
            {"from": 1, "to": 2, "better": "", "reason": "r"},                           # no replacement -> dropped
        ], "hedges": [{"from": 2, "to": 3}, {"from": 14, "to": 15}], "expert": EXPERT},      # second hedge overlaps an issue
        {"note": "n2", "issues": [], "hedges": [], "expert": EXPERT},
    ])
    out = drill_dialogue_service.finalize_review(raw, turns)
    t1 = out["turns"][0]
    assert [(i["from"], i["to"], i["better"]) for i in t1["issues"]] == [(12, 16, "fixed")]
    assert t1["issues"][0]["original"] == " ".join(w["w"] for w in turns[0]["words"][12:17])
    assert t1["hedges"] == [{"from": 2, "to": 3}]
    assert "filler" not in t1["words"][1]
    assert n > 16 and "skills" not in out
    assert t1["expert"]["answer"] == "I have worked with international teams for three years. I explain things simply."
    assert [p["kind"] for p in t1["expert"]["parts"]] == ["position", "position"]       # unknown kind -> position, empty text dropped
    assert t1["issues"][0]["topic"] == "Present perfect" and t1["issues"][0]["rule"]["examples"] == ["e"]
    assert out["nextStep"] == "Ask one question back." and out["turns"][0]["question"] == "Q1?"


def test_finalize_review_cleans_the_rule_card():
    turns = [{"question": "Q?", "words": make_words(ANSWER)}]
    raw = raw_review(turns=[{"note": "n", "issues": [{"from": 12, "to": 16, "better": "x", "topic": "T", "reason": "r",
                    "rule": {"formula": " f ", "when": " w ", "examples": ["a", " ", "b", "c", "d"]}}], "hedges": [], "expert": EXPERT}])
    rule = drill_dialogue_service.finalize_review(raw, turns)["turns"][0]["issues"][0]["rule"]
    assert rule == {"formula": "f", "when": "w", "examples": ["a", "b", "c"]}


def test_finalize_review_tolerates_a_missing_expert_block():
    turns = [{"question": "Q?", "words": make_words(ANSWER)}]
    out = drill_dialogue_service.finalize_review(raw_review(turns=[{"note": "n", "issues": [], "hedges": []}]), turns)
    assert out["turns"][0]["expert"] == {"answer": "", "parts": [], "why": ""}


def post_review(client, turns=None, **extra):
    body = {"context": "negotiation", "ui_locale": "ru", "turns": turns if turns is not None else turns_payload()}
    body.update(extra)
    return client.post("/api/drill/dialogue/review", json=body)


def fake_review(context, ui_locale, turns):
    CALLS["review"] = {"context": context, "ui_locale": ui_locale, "turns": turns}
    return drill_dialogue_service.finalize_review(raw_review(), turns)


def test_review_happy_path(client, monkeypatch):
    monkeypatch.setattr(drill_dialogue_service, "review", fake_review)
    r = post_review(client)
    assert r.status_code == 200
    body = r.json()
    assert body["headline"] and body["turns"][0]["expert"]["answer"] and len(body["turns"]) == 2
    assert body["turns"][0]["issues"][0]["original"]
    assert CALLS["review"]["context"] == "negotiation" and CALLS["review"]["ui_locale"] == "ru"
    assert CALLS["review"]["turns"][0]["words"][1].get("filler") is None       # flags are only what the page sent


def test_review_validation(client, monkeypatch):
    monkeypatch.setattr(drill_dialogue_service, "review", fake_review)
    assert post_review(client, turns=[]).status_code == 422
    assert post_review(client, turns=turns_payload(4)).status_code == 422
    assert post_review(client, turns=turns_payload(3)).status_code == 400      # the site setting allows 2 answers
    bad = turns_payload(1)
    bad[0]["words"] = bad[0]["words"][:2]
    assert post_review(client, turns=bad).status_code == 422
    huge = turns_payload(1)
    huge[0]["words"] = huge[0]["words"] * 40
    assert post_review(client, turns=huge).status_code == 422
    # unknown situation and locale fall back
    assert post_review(client, context="weird", ui_locale="xx").status_code == 200
    assert CALLS["review"]["context"] == "general" and CALLS["review"]["ui_locale"] == "en"


def test_review_counts_as_one_analysis_and_failure_is_refunded(client, monkeypatch):
    monkeypatch.setenv("DRILL_DAILY_LIMIT", "1")
    monkeypatch.setattr(drill_dialogue_service, "review", lambda *a: (_ for _ in ()).throw(RuntimeError("model down")))
    r = post_review(client)
    assert r.status_code == 502 and r.json()["detail"]["code"] == "analysis_failed"
    monkeypatch.setattr(drill_dialogue_service, "review", fake_review)
    assert post_review(client).status_code == 200      # the failed review did not use the only analysis
    r = post_review(client)
    assert r.status_code == 429 and r.json()["detail"]["code"] == "limit"


# ---------- the partner's voice ----------

def test_partner_voice_is_the_fast_english_model_and_falls_back_for_other_languages(monkeypatch):
    from services import deepgram_tts
    monkeypatch.delenv("DIALOGUE_VOICE_MODEL", raising=False)
    assert deepgram_tts.model_for("en", "p") == "aura-asteria-en"
    assert deepgram_tts.model_for("es", "p") == deepgram_tts.model_for("es", "b")
    monkeypatch.setenv("DIALOGUE_VOICE_MODEL", "aura-2-apollo-en")
    assert deepgram_tts.model_for("en", "p") == "aura-2-apollo-en"
    assert deepgram_tts.model_for("en", "a") == "aura-2-thalia-en"      # the model-answer voices are unchanged


def test_speak_accepts_the_partner_voice(client, monkeypatch):
    from services import deepgram_tts
    seen = {}

    async def fake(text, model, client=None, fmt="mp3"):
        seen["model"] = model
        return b"mp3"

    monkeypatch.setattr(deepgram_tts, "synthesize", fake)
    monkeypatch.delenv("DIALOGUE_VOICE_MODEL", raising=False)
    r = client.post("/api/drill/speak", json={"text": "How did you solve it?", "language": "en", "voice": "p"})
    assert r.status_code == 200 and seen["model"] == "aura-asteria-en"


def test_first_chunk_is_the_first_sentence_and_short_ones_join_the_next():
    fc = drill_dialogue_service.first_chunk
    assert fc("You mentioned a discount of ten percent. How would you justify it to us?") == "You mentioned a discount of ten percent."
    assert fc("Right. What did you do next about it?") == "Right. What did you do next about it?"      # a short opener joins the next sentence
    assert fc("How long did it take you to prepare that plan for the team? And what changed?") == "How long did it take you to prepare that plan for the team?"
    assert fc("A single sentence without punctuation") == "A single sentence without punctuation"
    # a long sentence is cut after its first clause so the first audio is quick to produce
    long = "So if the supplier says the delay is due to a shipping company problem, would you still expect them to give you a discount?"
    assert fc(long) == "So if the supplier says the delay is due to a shipping company problem,"
    assert fc("A very long sentence with no commas at all that just keeps going and going until the end of the line?") == "A very long sentence with no commas at all that just keeps going and going until the end of the line?"


def test_turn_answer_carries_the_first_sentence_as_audio_and_timing(client, monkeypatch):
    seen = {}
    stt = fake_stt()
    monkeypatch.setattr(deepgram_service, "transcribe", stt)
    monkeypatch.setattr(drill_dialogue_service, "next_question", lambda *a: "What discount did you have in mind exactly? And why that number?")

    async def fake_synth(text, model, client=None, fmt="mp3"):
        seen["text"], seen["model"] = text, model
        return b"MP3DATA"
    monkeypatch.setattr(drill.deepgram_tts, "synthesize", fake_synth)
    r = turn(client, history=json.dumps([]))
    assert r.status_code == 200
    body = r.json()
    import base64
    assert body["questionAudio"]["text"] == "What discount did you have in mind exactly?"
    assert base64.b64decode(body["questionAudio"]["audio"]) == b"MP3DATA" and seen["text"] == body["questionAudio"]["text"]
    assert set(body["timing"]) == {"stt_ms", "next_ms", "llm_ms", "voice_ms"}


def test_turn_answer_survives_a_failing_voice(client, monkeypatch):
    monkeypatch.setattr(deepgram_service, "transcribe", fake_stt())
    monkeypatch.setattr(drill_dialogue_service, "next_question", lambda *a: "What happened next?")

    async def boom(text, model, client=None, fmt="mp3"):
        raise drill.deepgram_tts.TtsError("down")
    monkeypatch.setattr(drill.deepgram_tts, "synthesize", boom)
    body = turn(client, history=json.dumps([])).json()
    assert body["question"] == "What happened next?" and "questionAudio" not in body


# ---------- live dialogue socket ----------

class FakeLive:
    """Stands in for the Deepgram live connection."""
    instances = []
    open_error = None
    text = ANSWER

    def __init__(self, language="en"):
        self.pcm = 0
        self.closed = False
        FakeLive.instances.append(self)

    async def open(self):
        if FakeLive.open_error:
            raise FakeLive.open_error

    async def send(self, pcm):
        self.pcm += len(pcm)

    async def finish(self):
        words = [{"word": w, "start": i * 0.5, "end": i * 0.5 + 0.3, "confidence": 0.99} for i, w in enumerate(FakeLive.text.split())]
        return {"results": {"channels": [{"alternatives": [{"words": words}]}]}, "metadata": {"duration": 12.0}}

    async def close(self):
        self.closed = True


async def _no_warm(fmt="mp3"):
    return None


@pytest.fixture
def live(client, monkeypatch):
    FakeLive.instances = []
    FakeLive.open_error = None
    FakeLive.text = ANSWER
    monkeypatch.setattr(drill.deepgram_live, "LiveSession", FakeLive)
    monkeypatch.setattr(drill_dialogue_service, "next_question", fake_next)
    monkeypatch.setattr(drill_dialogue_service, "warm", lambda: None)
    monkeypatch.setattr(drill, "_keep_voice_warm", _no_warm)

    async def no_voice(text, model, client=None, fmt="mp3"):
        raise drill.deepgram_tts.TtsError("off")
    monkeypatch.setattr(drill.deepgram_tts, "synthesize", no_voice)
    return client


START = {"type": "start", "question": "What would you do?", "context": "negotiation", "turn": 1, "total": 2, "history": []}


def run_live(client, start=START, frames=3, origin=None):
    headers = {"origin": origin} if origin else {}
    with client.websocket_connect("/api/drill/dialogue/live", headers=headers) as ws:
        ws.send_json(start)
        first = ws.receive_json()
        if first.get("type") != "ready":
            return first
        for _ in range(frames):
            ws.send_bytes(b"\x00\x01" * 1600)
        ws.send_json({"type": "end"})
        return ws.receive_json()


def test_live_answer_returns_text_words_and_the_next_question(live):
    out = run_live(live)
    assert out["type"] == "result"
    assert out["question"] == "Can you give me a concrete example?" and out["transcript"].startswith("well um I think")
    assert out["words"][1]["filler"] is True and set(out["timing"]) == {"stt_ms", "next_ms", "llm_ms", "voice_ms"}
    assert FakeLive.instances[0].pcm == 3 * 3200 and FakeLive.instances[0].closed


def test_live_last_turn_has_no_question(live):
    out = run_live(live, {**START, "turn": 2, "history": [{"question": "Q1?", "answer": "A1"}]})
    assert out["type"] == "result" and "question" not in out


def test_live_short_answer_is_refused_and_not_counted(live):
    FakeLive.text = "yes sure"
    out = run_live(live)
    assert out == {"type": "error", "code": "empty"} or out["code"] in ("empty", "too_short")


def test_live_provider_failure_is_reported_and_refunded(live):
    FakeLive.open_error = drill.deepgram_service.SttError("down")
    assert run_live(live) == {"type": "error", "code": "stt_failed"}
    assert drill_rate_limit.acquire_turn("testclient", 2)      # the failed attempt was not charged and the slot was released


def test_live_foreign_origin_is_rejected(live):
    from starlette.websockets import WebSocketDisconnect as WSD
    with pytest.raises(WSD):
        with live.websocket_connect("/api/drill/dialogue/live", headers={"origin": "https://evil.example"}) as ws:
            ws.send_json(START)
            ws.receive_json()


def test_live_bad_start_and_daily_limit(live, monkeypatch):
    assert run_live(live, {"type": "start", "question": "", "turn": 1, "total": 2})["code"] == "bad_request"
    assert run_live(live, {**START, "turn": 9})["code"] == "bad_request"
    monkeypatch.setenv("DRILL_DIALOGUE_DAILY_TURNS", "1")
    assert run_live(live)["type"] == "result"
    assert run_live(live) == {"type": "error", "code": "limit"}


def test_audio_format_is_chosen_by_the_page_and_cached_separately(monkeypatch):
    from services import deepgram_tts
    assert deepgram_tts.clean_format("ogg") == "ogg" and deepgram_tts.clean_format("wav") == "mp3" and deepgram_tts.clean_format(None) == "mp3"
    assert deepgram_tts.mime_for("ogg") == "audio/ogg" and deepgram_tts.mime_for("mp3") == "audio/mpeg"
    assert deepgram_tts._key("Hi.", "m") != deepgram_tts._key("Hi.", "m", "ogg")
    assert deepgram_tts._key("Hi.", "m") == deepgram_tts._key("Hi.", "m", "mp3")


def test_live_answer_uses_the_requested_voice_format(live, monkeypatch):
    seen = {}

    async def synth(text, model, client=None, fmt="mp3"):
        seen["fmt"] = fmt
        return b"OGG"
    monkeypatch.setattr(drill.deepgram_tts, "synthesize", synth)
    out = run_live(live, {**START, "format": "ogg"})
    assert out["questionAudio"]["mime"] == "audio/ogg" and seen["fmt"] == "ogg"


def test_a_stale_pooled_connection_is_retried_once(monkeypatch):
    import asyncio
    import httpx
    from services import deepgram_tts

    calls = {"n": 0}

    class Flaky:
        is_closed = False

        async def post(self, *a, **k):
            calls["n"] += 1
            if calls["n"] == 1:
                raise httpx.RemoteProtocolError("server closed the connection")
            return SimpleNamespace(status_code=200, content=b"OK")

    monkeypatch.setenv("DEEPGRAM_API_KEY", "x")
    monkeypatch.setattr(deepgram_tts, "shared_client", lambda: Flaky())
    audio = asyncio.run(deepgram_tts.synthesize("a retry test sentence for the cache", "aura-asteria-en"))
    assert audio == b"OK" and calls["n"] == 2
