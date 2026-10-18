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

    async def fake(text, model, client=None):
        seen["model"] = model
        return b"mp3"

    monkeypatch.setattr(deepgram_tts, "synthesize", fake)
    monkeypatch.delenv("DIALOGUE_VOICE_MODEL", raising=False)
    r = client.post("/api/drill/speak", json={"text": "How did you solve it?", "language": "en", "voice": "p"})
    assert r.status_code == 200 and seen["model"] == "aura-asteria-en"
