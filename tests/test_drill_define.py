import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import drill
from services import drill_define_service, drill_rate_limit


@pytest.fixture
def client(monkeypatch):
    drill_rate_limit.reset()
    drill_define_service._cache.clear()
    monkeypatch.delenv("DRILL_DISABLE_LIMIT", raising=False)
    monkeypatch.delenv("DRILL_DEFINE_DAILY", raising=False)
    app = FastAPI()
    app.include_router(drill.router, prefix="/api")
    return TestClient(app)


def fake_define(calls):
    def _d(word, sentence, language, ui_locale):
        calls.append((word, sentence, language, ui_locale))
        return {"translation": "дать", "note": "verb"}
    return _d


def test_define_returns_a_translation(client, monkeypatch):
    calls = []
    monkeypatch.setattr(drill_define_service, "define", fake_define(calls))
    r = client.post("/api/drill/define", json={"word": "  give,", "sentence": "We can give you a discount.", "language": "en", "ui_locale": "ru"})
    assert r.status_code == 200 and r.json() == {"translation": "дать", "note": "verb"}
    assert calls == [("give", "We can give you a discount.", "en", "ru")]       # punctuation trimmed


def test_define_validation(client, monkeypatch):
    monkeypatch.setattr(drill_define_service, "define", fake_define([]))
    bad = [
        {"word": "", "language": "en", "ui_locale": "ru"},
        {"word": "two words", "language": "en", "ui_locale": "ru"},
        {"word": "x" * 41, "language": "en", "ui_locale": "ru"},
        {"word": "give", "language": "xx", "ui_locale": "ru"},
        {"word": "give", "language": "en", "ui_locale": "zz"},
    ]
    for body in bad:
        assert client.post("/api/drill/define", json=body).status_code == 400, body


def test_define_is_capped_per_ip_but_cache_hits_are_free(client, monkeypatch):
    monkeypatch.setenv("DRILL_DEFINE_DAILY", "2")
    monkeypatch.setattr(drill_define_service, "define", lambda *a: drill_define_service._cache.setdefault((a[0].lower(), a[1].lower()[:200], a[2], a[3]), {"translation": "t", "note": ""}))
    ask = lambda w: client.post("/api/drill/define", json={"word": w, "sentence": "s", "language": "en", "ui_locale": "ru"})
    assert ask("one").status_code == 200 and ask("two").status_code == 200
    assert ask("three").status_code == 429
    assert ask("one").status_code == 200            # cached: not counted


def test_define_model_failure_is_a_502(client, monkeypatch):
    def boom(*a):
        raise RuntimeError("model down")
    monkeypatch.setattr(drill_define_service, "define", boom)
    r = client.post("/api/drill/define", json={"word": "give", "sentence": "s", "language": "en", "ui_locale": "ru"})
    assert r.status_code == 502
