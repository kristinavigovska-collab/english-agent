"""Finite grammar/speech error categories — required for cross-lesson pattern tracking."""

from __future__ import annotations

from typing import Optional

# id → Russian label shown on dashboard
ERROR_CATEGORIES: dict[str, str] = {
    "third_person_singular": "Согласование 3-го лица ед.ч.",
    "noun_plural": "Множественное число существительных",
    "verb_preposition": "Предлоги после глаголов",
    "tense_agreement": "Согласование времён",
    "past_simple": "Past Simple",
    "present_perfect": "Present Perfect / Past vs Perfect",
    "conditionals": "Условные предложения",
    "question_formation": "Построение вопросов",
    "possessive": "Притяжательный падеж",
    "articles": "Артикли (a/an/the)",
    "comparatives": "Сравнительная и превосходная степень",
    "gerunds_infinitives": "Gerund vs Infinitive",
    "much_many": "Much vs Many / исчисляемость",
    "word_order": "Порядок слов",
    "fillers_coherence": "Слова-филлеры / связность речи",
    "modals": "Модальные глаголы",
    "other": "Прочее",
}

DEFAULT_ERROR_CATEGORY = "other"

# For Claude structured output — stable enum list
ERROR_CATEGORY_IDS: tuple[str, ...] = tuple(ERROR_CATEGORIES.keys())


def category_label(category_id: Optional[str]) -> str:
    if not category_id:
        return ERROR_CATEGORIES[DEFAULT_ERROR_CATEGORY]
    return ERROR_CATEGORIES.get(category_id, ERROR_CATEGORIES[DEFAULT_ERROR_CATEGORY])


def normalize_category(value: Optional[str]) -> str:
    if not value:
        return DEFAULT_ERROR_CATEGORY
    key = value.strip().lower().replace(" ", "_").replace("-", "_")
    if key in ERROR_CATEGORIES:
        return key
    # fuzzy aliases from model output
    aliases = {
        "third_person": "third_person_singular",
        "3rd_person": "third_person_singular",
        "plural_nouns": "noun_plural",
        "prepositions": "verb_preposition",
        "prepositions_after_verbs": "verb_preposition",
        "tense": "tense_agreement",
        "tenses": "tense_agreement",
        "questions": "question_formation",
        "possessives": "possessive",
        "article_usage": "articles",
        "comparative": "comparatives",
        "gerund": "gerunds_infinitives",
        "infinitive": "gerunds_infinitives",
        "fillers": "fillers_coherence",
        "coherence": "fillers_coherence",
    }
    return aliases.get(key, DEFAULT_ERROR_CATEGORY)


def infer_category_from_text(
    error: str = "",
    correction: str = "",
    explanation: str = "",
) -> str:
    """Heuristic mapping for legacy reports without error_category."""
    blob = " ".join([error, correction, explanation]).lower()

    rules: list[tuple[str, tuple[str, ...]]] = [
        ("third_person_singular", ("3-го лица", "third person", "doesn't", "does not", "-s", "he go", "she go")),
        ("noun_plural", ("множествен", "plural", "sisters", "brothers")),
        ("present_perfect", ("present perfect", "have +", "since ", "for ", "have went", "have went")),
        ("past_simple", ("past simple", "didn't", "last year", "yesterday", "went", " irregular")),
        ("articles", ("артикл", "article", " a ", " an ", " the ")),
        ("comparatives", ("comparative", "better", "more better", "superlative")),
        ("conditionals", ("conditional", "if i will", "if i have")),
        ("gerunds_infinitives", ("gerund", "infinitive", "suggest", "look forward to")),
        ("much_many", ("much vs many", "many people", "much people")),
        ("verb_preposition", ("preposition", "предлог", "look forward", "depend on")),
        ("question_formation", ("question", "вопрос", "do you", "did you")),
        ("possessive", ("possessive", "притяж", "'s", " my ", " your ")),
        ("modals", ("modal", "should", "must", "could", "would")),
        ("fillers_coherence", ("filler", "связность", "discourse")),
        ("word_order", ("word order", "порядок слов")),
        ("tense_agreement", ("sequence of tenses", "согласование врем")),
    ]

    for cat_id, needles in rules:
        if any(n in blob for n in needles):
            return cat_id
    return DEFAULT_ERROR_CATEGORY
