# Architecture

## Two product tracks

The codebase serves **two related flows**. Only the first is backed by Supabase today.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TRACK A — Live lessons (PRODUCTION)                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ Google Calendar → Recall bot → webhook → Claude → lessons + reports   │
│ Dashboard Home: lesson tabs read GET /api/students/{id}/reports       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ TRACK B — Programs & subscription (UI ONLY, June 2026)                │
├─────────────────────────────────────────────────────────────────────────┤
│ Programs nav → catalog + detail + EUR plan cards (dashboard.js)       │
│ Enrollment: localStorage enrolled_program_id — NOT in database        │
│ Checkout: /checkout?plan=&program= — route NOT implemented            │
│ Sidebar curriculum: separate placeholder (PLACEHOLDER_CEFR_CURRICULUM)  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Target state (not built):** enrollment in Supabase links student → program → plan; curriculum units map to Classes; optional `lessons.program_id` on webhook.

## Flow — live lessons (Track A)

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
- Resolves `lesson_topic` from calendar / Recall metadata → `lessons.lesson_topic` (migration 005)
- Background: `get_or_create_student` → `create_lesson` → `analyze_transcript` → `save_report` → sync `error_pattern_history` + `daily_progress` (lesson day)

## Claude output (stored in `reports`)

- `grammar_errors[]` — `error`, `correction`, `explanation`, `error_category` (catalog in `services/error_category_config.py`)
- `vocabulary_level` — CEFR string
- `fluency_score` — 0.0–10.0
- `weak_topics[]`, `recommendations[]`

Student context from `services/student_profiles.py` (name, goal, target CEFR). Rubric helpers in `services/rubric_service.py`.

## API (current)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Health |
| POST | `/webhook/recall` | Recall ingress (signed when secret set) |
| GET | `/api/students/{id}/reports` | JSON: reports + goal + `study_plan` + `progress_tracker` + `error_tracking` |
| PATCH | `/api/students/{id}/goal` | Set/update learning goal → recalculates plan + tracker grid |
| POST | `/api/students/{id}/practice` | Mark self-practice day complete (`MarkPracticeRequest`) |
| GET | `/api/dashboard/{id}` | HTML dashboard (injects `__STUDENT_ID__`, cache-busted static assets) |
| GET | `/dashboard` | Static demo dashboard (embedded mock data in `dashboard.js`) |

**Not implemented:** `/api/programs`, `/api/students/{id}/enrollment`, `/checkout`.

Response shapes: `models/schemas.py` (`StudentReportsResponse`, `StudyPlanResponse`, `ProgressTrackerResponse`, `ErrorTrackingResponse`).

## Database (Supabase)

Core tables (initial setup — see `README.md`):

- `students` — upsert by `email`
- `lessons` — `recall_bot_id`, `transcript`, `lesson_topic` (from webhook, migration 005)
- `reports` — Claude JSON fields per lesson

Extended columns and tables — apply migrations in order (`docs/MIGRATIONS.md`):

| Migration | Adds |
|-----------|------|
| `001` | `students`: goal fields (`target_cefr_level`, `target_date`, …) |
| `002` | `students`: goal type, duration, scenario, tutor/practice schedule |
| `003` | `daily_progress` — per-day planned/completed minutes |
| `004` | `error_pattern_history` — cross-lesson error categories |
| `005` | `lessons.lesson_topic` |
| `006` | `students.study_intensity_preset` |

**Services:** `goal_plan_service.py`, `daily_progress_service.py`, `error_pattern_service.py`, `intensity_config.py` compute plan, tracker grid, and stuck-topic prioritization for API + dashboard.

### Programs schema (migration `007` — apply on Supabase; API not wired)

| Table / column | Purpose |
|----------------|---------|
| `programs` | Catalog: TEXT id, category, level_id, title, description, classes/weeks, tags, optional `base_*` for special programs |
| `program_plans` | Global tiers: free_trial, solo, light, standard, intensive (EUR in `price_cents`) |
| `student_enrollments` | student_id, program_id, plan_id, status; one active/trial per student |
| `curriculum_units` | **008+** — ordered Classes per program |
| `lessons.program_id` | **008+** — optional FK: tie live lesson to enrolled program |

Spec: `docs/PROGRAMS.md`. Seed ids match `PROGRAM_CATALOG` in `dashboard.js`.

## Dashboard (static SPA)

| Route | Mode |
|-------|------|
| `/dashboard` | Demo — mock reports, client-side plan/tracker math mirrors server |
| `/api/dashboard/{student_id}` | Live — `dashboard.js` fetches `/api/students/{id}/reports` |

### Navigation views

| View | DOM id | Content |
|------|--------|---------|
| Home | `#view-home` | Sidebar (goal, curriculum placeholder) + lesson report tabs |
| Programs | `#view-programs` | Catalog, filters, program detail + plan pricing (JS placeholders) |
| Analytics | `#view-analytics` | Activity heatmap + general progress / goal pace |

State: `localStorage` (`app_nav_view`, `enrolled_program_id`, `sidebar_goal_collapsed`, …).

### Programs UI data flow (today)

```
PROGRAM_CATALOG + PROGRAM_LEARNING_PLANS  (dashboard.js constants)
        │
        ▼
renderProgramsPage() / renderProgramDetailPage()
        │
        ├── enrolled_program_id → localStorage (browser only)
        └── plan CTA → window.location /checkout?plan=&program=  (404 until built)
```

Sidebar `renderCurriculumProgram()` uses **separate** `PLACEHOLDER_CEFR_CURRICULUM` — not derived from `PROGRAM_CATALOG`.

### Design

- Accent color: `#6687FF` (`--accent` in `dashboard.css`)
- Cache bust: `dashboard.html` links `dashboard.js?v=…` — bump after JS/CSS changes

## External accounts

- **Render:** env vars from `.env.example`
- **Recall:** Calendar V1 + webhook; EU region `eu-central-1`
- **Google Cloud:** OAuth client for Recall Calendar Connect; consent screen + test users while in Testing

## Future (not built)

- Programs API (`GET /api/programs`, enrollment) — migration `007` SQL ready; see `docs/PROGRAMS.md`
- Checkout / Stripe; per-program subscription billing
- `schools`, teacher roles, RLS
- Email magic link auth (today: anyone with `student_id` UUID sees dashboard)
- Auto-email “report ready” after webhook
- Idempotent webhook / job queue (Render restarts can drop BackgroundTasks on crash — use `scripts/reprocess_lesson.py`)
- Claude prompt: include enrolled program + current Class from curriculum
