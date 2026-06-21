from services.recall_service import extract_lesson_topic_from_webhook


def test_extract_lesson_topic_from_metadata():
    data = {
        "metadata": {"lesson_topic": "  Travel & Past Tenses  "},
        "bot_id": "bot-1",
    }
    assert extract_lesson_topic_from_webhook(data) == "Travel & Past Tenses"


def test_extract_lesson_topic_prefers_lesson_topic_over_title():
    data = {
        "metadata": {
            "lesson_topic": "Conditionals",
            "title": "English Lesson",
        }
    }
    assert extract_lesson_topic_from_webhook(data) == "Conditionals"


def test_extract_lesson_topic_from_calendar_meeting_title():
    data = {
        "calendar_meetings": [
            {"id": "m1", "title": "B2 Speaking Practice"},
        ]
    }
    assert extract_lesson_topic_from_webhook(data) == "B2 Speaking Practice"


def test_extract_lesson_topic_empty_when_missing():
    assert extract_lesson_topic_from_webhook({}) == ""
    assert extract_lesson_topic_from_webhook({"metadata": {}}) == ""
