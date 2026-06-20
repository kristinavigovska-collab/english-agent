# Architecture

## Flow

```
Google Calendar (school) ──► Recall.ai bot joins Meet/Zoom
                                    │
                                    ▼ transcript webhook
                    english-agent.onrender.com/webhook/recall
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
              Claude (analysis)              200 OK immediate
                    │                      (BackgroundTasks)
                    ▼
              Supabase: students → lessons → reports
                    │              daily_progress, error_pattern_history
                    ▼
              GET /api/students/{id}/reports  (JSON + goal + plan + tracker)
              GET /api/dashboard/{id}         (HTML shell + live fetch)
              GET /dashboard                    (demo data, no student id)
```

## Webhook handling

File: `routers/webhook.py`

**Signature:** `_verify_recall_signature()` — Svix-style HMAC-SHA256 when `RECALL_WEBHOOK_SECRET` is set. See `AGENTS.md` and `docs/STATUS.md` for env/troubleshooting. Do not list as future work.

**Events:**

| Group | Events |
|-------|--------|
| Realtime append | `transcript.data`, `transcript.partial_data` |
| Finalize | `transcript.done`, legacy `bot.transcription_complete`, `bot.transcript` |
| Legacy append | `bot.transcription` |
| Recording | `recording.done` — triggers full transcript fetch via `recall_service.py` |

**Pipeline:**

- Parses transcript (list or segments shape); merges partial + final
- Student: `metadata.student_email` / calendar guest / `participants[0].email` / fallback `{bot_id}@recall.local`
- Background: `get_or_create_student` → `create_lesson` → `analyze_transcript` → `save_report` → sync `error_pattern_history` + `daily_progress` (lesson day)

## Claude output (stored in `reports`)

- `grammar_errors[]` — `error`, `correction`, `explanation`, `error_category` (catalog in `services/error_category_config.py`)
- `vocabulary_level` — CEFR string
- `fluency_score` — 0.0–10.0
- `weak_topics[]`, `recommendations[]`

Student context from `services/student_profiles.py` (name, goal, target CEFR). Rubric helpers in `services/rubric_service.py`.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Health |
| POST | `/webhook/recall` | Recall ingress (signed when secret set) |
| GET | `/api/students/{id}/reports` | JSON: reports + goal + `study_plan` + `progress_tracker` + `error_tracking` |
| PATCH | `/api/students/{id}/goal` | Set/update learning goal → recalculates plan + tracker grid |
| POST | `/api/students/{id}/practice` | Mark self-practice day complete (`MarkPracticeRequest`) |
| GET | `/api/dashboard/{id}` | HTML dashboard (injects `__STUDENT_ID__`, cache-busted static assets) |
| GET | `/dashboard` | Static demo dashboard (embedded mock data in `dashboard.js`) |

Response shapes: `models/schemas.py` (`StudentReportsResponse`, `StudyPlanResponse`, `ProgressTrackerResponse`, `ErrorTrackingResponse`).

## Database (Supabase)

Core tables (initial setup — see `README.md`):

- `students` — upsert by `email`
- `lessons` — `recall_bot_id`, `transcript`, optional `lesson_topic` (not wired from calendar yet)
- `reports` — Claude JSON fields per lesson

Extended columns and tables — apply migrations in order (`docs/MIGRATIONS.md`):

| Migration | Adds |
|-----------|------|
| `001` | `students`: `target_cefr_level`, `target_date`, `goal_label`, `goal_set_date` |
| `002` | `students`: `goal_type`, `target_duration_weeks`, `scenario_description`, `goal_start_cefr_level`, tutor/practice schedule fields |
| `003` | `daily_progress` — per-day planned/completed minutes |
| `004` | `error_pattern_history` — cross-lesson error categories, stuck/new status |

**Services:** `goal_plan_service.py`, `daily_progress_service.py`, `error_pattern_service.py` compute plan, tracker grid, and stuck-topic prioritization for API + dashboard.

## Dashboard (static)

| Route | Mode |
|-------|------|
| `/dashboard` | Demo — mock reports, client-side plan/tracker math mirrors server |
| `/api/dashboard/{student_id}` | Live — `dashboard.js` fetches `/api/students/{id}/reports` |

UI highlights: goal strip above tabs, study plan progress, modal daily tracker (`tracker-teaser` → `tracker-overlay`), expandable grammar explanations, stuck-topic block (`error_tracking.stuck_topics`), grammar badges (stuck/new).

Static cache bust: `dashboard.html` links `dashboard.js?v=…` — bump after JS changes.

## External accounts

- **Render:** env vars from `.env.example`
- **Recall:** Calendar V1 + webhook; EU region `eu-central-1`
- **Google Cloud:** OAuth client for Recall Calendar Connect; consent screen + test users while in Testing

## Future (not built)

- `schools`, teacher roles, RLS
- Email magic link auth (today: anyone with `student_id` UUID sees dashboard)
- `lessons.lesson_topic` from calendar event title / school materials
- Auto-email “report ready” after webhook
- Idempotent webhook / job queue (Render restarts can drop BackgroundTasks on crash — use `scripts/reprocess_lesson.py`)
