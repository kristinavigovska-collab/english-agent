from services.programs_catalog import (
    get_program,
    load_programs_catalog,
    program_api_to_row,
    program_row_to_api,
)


def test_load_programs_catalog_not_empty():
    catalog = load_programs_catalog()
    assert len(catalog) >= 6
    assert all(p.get("id") for p in catalog)
    assert all(p.get("category") != "general" for p in catalog)
    assert all(not str(p.get("id", "")).startswith("general-") for p in catalog)


def test_get_program_by_id():
    program = get_program("special-negotiations")
    assert program is not None
    assert program["title"] == "Negotiations in English"


def test_get_program_missing_returns_none():
    assert get_program("does-not-exist") is None
    assert get_program("general-beginner") is None


def test_program_row_to_api_maps_db_columns():
    row = {
        "id": "special-ielts",
        "category": "special",
        "level_id": "upper_intermediate",
        "title": "IELTS Preparation",
        "description": "Exam prep",
        "classes_count": 16,
        "weeks_count": 8,
        "tags": ["Reading"],
        "base_category": "business",
        "base_level_id": "upper_intermediate",
    }
    program = program_row_to_api(row)
    assert program["levelId"] == "upper_intermediate"
    assert program["classes"] == 16
    assert program["base"] == {
        "category": "business",
        "levelId": "upper_intermediate",
    }


def test_program_api_to_row_roundtrip():
    program = {
        "id": "business-intermediate",
        "category": "business",
        "levelId": "intermediate",
        "title": "Business English — Intermediate",
        "description": "Office English",
        "classes": 24,
        "weeks": 12,
        "tags": ["A"],
    }
    row = program_api_to_row(program, 10)
    assert program_row_to_api(row) == program


def test_validate_programs_catalog_accepts_file():
    from services.programs_catalog import read_catalog_json_file, validate_programs_catalog

    catalog = read_catalog_json_file()
    assert not validate_programs_catalog(catalog)


def test_validate_programs_catalog_rejects_duplicate_ids():
    from services.programs_catalog import validate_programs_catalog

    errors = validate_programs_catalog(
        [
            {
                "id": "dup",
                "category": "special",
                "levelId": "beginner",
                "title": "A",
                "description": "A",
                "classes": 1,
                "weeks": 1,
                "tags": [],
            },
            {
                "id": "dup",
                "category": "special",
                "levelId": "beginner",
                "title": "B",
                "description": "B",
                "classes": 1,
                "weeks": 1,
                "tags": [],
            },
        ]
    )
    assert any("duplicate" in error for error in errors)


def test_validate_rejects_general_category():
    from services.programs_catalog import validate_programs_catalog

    errors = validate_programs_catalog(
        [
            {
                "id": "general-beginner",
                "category": "general",
                "levelId": "beginner",
                "title": "General English — Beginner",
                "description": "Start",
                "classes": 24,
                "weeks": 12,
                "tags": [],
            }
        ]
    )
    assert any("invalid category" in error for error in errors)
