# ADR-002: Server as single source of truth for dashboard calculations

## Status

Accepted (June 2026)

## Context

Study plan, error pattern tracking, intensity presets, and CEFR constants were duplicated in `dashboard.js` and Python services. Demo mode recalculated on the client with formulas that could drift from production.

## Decision

1. **Server** owns all calculation logic (`goal_plan_service`, `error_pattern_service`, `daily_progress_service`, `curriculum_service`).
2. **Client** loads `GET /api/config` once and renders API payloads only — no `computeStudyPlanClient` / `buildErrorTracking`.
3. **Demo** uses `GET /api/demo/*` endpoints backed by fixtures generated from Python services (`scripts/generate_demo_fixtures.py`). Demo goal edits call `POST /api/demo/goal` for server-side recalculation.
4. **Constants** live in `services/app_config.py`; `/api/config` serializes the same object.

## Consequences

- Formula changes require updating Python + regenerating fixtures (`python scripts/generate_demo_fixtures.py`).
- Dashboard must load config before init; missing config shows an error banner (no client fallback constants).
- `data/programs_catalog.json` syncs from `PROGRAM_CATALOG` via `scripts/sync_programs_catalog.py`.
