# Agent context — English Lesson Analyzer

**Read this first** in a new chat. Details: `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/MIGRATIONS.md`, `docs/PROGRAMS.md` (programs track).

## Product

SaaS for an English school: Recall.ai bot joins lessons → transcript → Claude analysis → Supabase → student report (dashboard).

**School model:** one Google Calendar on Recall (school account later). Student = guest email on calendar event. Not “invite agent by email”.

**Two product tracks (important):**

| Track | Status | Source of truth |
|-------|--------|-----------------|
| **Live lessons** | Backend **production-ready** | Recall webhook → `lessons` / `reports` in Supabase |
| **Programs & subscriptions** | **Partial backend** (June 2026) | `programs` / `student_enrollments` in Supabase; dashboard loads `GET /api/programs` + enrollment API |

These tracks are **not fully wired together** in the database. A student can have lesson reports without enrollment; `lessons.program_id` is not set by the webhook yet.

## Live URLs

| What | URL |
|------|-----|
| API / health | https://english-agent.onrender.com/ |
| Webhook | `POST https://english-agent.onrender.com/webhook/recall` |
| Dashboard | `/dashboard` (demo) · `/api/dashboard/{student_id}` (live) |
| Reports JSON | `GET /api/students/{student_id}/reports` |
| Supabase project | `esmtlsjbovkqtzrheijl.supabase.co` |
| Recall region | `eu-central-1.recall.ai` |

## Stack

FastAPI · Claude (`claude-opus-4-8`, structured JSON) · Supabase · Recall.ai Calendar V1 · Render (free tier, cold start ~30–50s).

## Repo map

```
main.py                          # App entry, mounts routers
routers/webhook.py               # Recall → signature verify → lesson_topic → background analysis
routers/reports.py               # Reports API, goal PATCH, practice POST, dashboard HTML
services/claude_service.py       # Transcript → structured LessonAnalysis
services/recall_service.py       # Full transcript download; lesson_topic from webhook/calendar
services/supabase_service.py     # CRUD Supabase
services/transcript_service.py   # Parse / merge transcript shapes
services/student_profiles.py     # Per-email profiles for Claude (test student: Кристина)
services/goal_plan_service.py    # Study plan hours, pace, status
services/intensity_config.py     # Study intensity presets (once_week / few_times_week / daily)
services/daily_progress_service.py  # Habit grid, streak, mark practice
services/error_pattern_service.py   # Cross-lesson categories, stuck/new
services/error_category_config.py   # Category catalog + normalization
services/rubric_service.py       # CEFR / scoring helpers
models/schemas.py                # Pydantic API + Claude models
static/dashboard.html            # UI shell; demo at /dashboard, live at /api/dashboard/{id}
static/dashboard.css             # Accent #6687FF; programs + analytics layout
static/dashboard.js              # Demo + live; nav views, programs catalog, curriculum placeholders
scripts/migrations/              # 001–007 SQL (see docs/MIGRATIONS.md)
scripts/run_supabase_migration.py
scripts/reprocess_lesson.py      # CLI: re-fetch transcript + re-run Claude
scripts/test_webhook_sig.py      # Webhook signature smoke test
tests/                           # test_goal_plan_service, test_error_pattern_service
render.yaml
docs/                            # STATUS, ARCHITECTURE, MIGRATIONS, PROGRAMS, LESSON_DAY, DEPLOY_RENDER
```

## Dashboard UI (June 2026)

### App navigation (`app-nav`)

Three top-level views (labels in **English**): **Home** · **Programs** · **Analytics**.

- State: `localStorage` keys `app_nav_view` (`home` \| `programs` \| `analytics`), `app_nav_collapsed`
- Shell: `#view-home`, `#view-programs`, `#view-analytics` in `dashboard.html`
- Logic: `setAppNavView()`, `initAppNav()` in `dashboard.js`

### Home (`#view-home`)

**Sidebar:** CEFR «Сейчас → Цель»; collapsible **«Цель и план»** (`sidebar_goal_collapsed`). **«Программа обучения»** curriculum list — **placeholder** (`PLACEHOLDER_CEFR_CURRICULUM` in JS; not tied to Programs catalog).

**Main tabs:** Class summary · Краткое саммари · Детальный отчёт. Lesson reports from API on live dashboard.

Activity metrics moved to **Analytics** (not on Home).

### Analytics (`#view-analytics`)

Tabs: **Активность** (heatmap, metrics, breakdown) · **Общий прогресс** (goal/plan pace, intensity presets, alerts). Data from API `progress_tracker`, `study_plan`, `goal` on live load.

### Programs (`#view-programs`)

**Catalog:** category tabs (General / Business / Special), level chips, grid of `program-card` tiles. Button **«Посмотреть программу»** opens detail (not enroll).

**Enrolled program hero:** first grid slot when `localStorage.enrolled_program_id` is set — same card size as catalog; **«Продолжить обучение»** → Home.

**Program detail** (in-page, not a separate route): course description, format block (**30 min self-study + 30 min live**), horizontal **EUR plan cards** (free_trial, solo, light, standard, intensive). Plan buttons link to **`/checkout?plan={id}&program={program_id}`** — **route not implemented**.

**Enrollment:** live students → `PUT /api/students/{id}/enrollment` on plan selection; demo/preview → `EnrollmentState` + localStorage cache. Catalog: `GET /api/programs` (no embedded JS catalog).

**Placeholder data:** `PROGRAM_LEARNING_PLANS` in `dashboard.js` — plans API later; catalog is `data/programs_catalog.json` + Supabase.

### Design tokens

- Primary accent: **`#6687FF`** (`--accent` in `dashboard.css`)
- Cache bust: bump `?v=` on `dashboard.css` / `dashboard.js` in `dashboard.html` after static edits

## DB (Supabase)

Base: `students` (upsert by `email`), `lessons` (`recall_bot_id`, `transcript`, `lesson_topic`), `reports` (Claude JSON).

Goal/plan on `students` (migrations 001–002): `target_cefr_level`, `target_date`, `goal_label`, `goal_type`, `target_duration_weeks`, `scenario_description`, tutor/practice schedule fields.

`study_intensity_preset` on `students` (migration 006): `once_week` \| `few_times_week` \| `daily`.

`reports.grammar_errors`: `error`, `correction`, `explanation`, `error_category`.

Also: `daily_progress` (003), `error_pattern_history` (004), `lessons.lesson_topic` (005). Full list: `docs/MIGRATIONS.md`.

**Programs tables (migration 007):** `programs`, `program_plans`, `student_enrollments`. Not yet: `lessons.program_id`, checkout/Stripe.

## Env vars (see `.env.example`)

| Variable | Required | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | yes | Claude analysis |
| `SUPABASE_URL`, `SUPABASE_KEY` | yes | `sb_secret_…` needs `supabase>=2.16` |
| `RECALL_API_KEY`, `RECALL_REGION` | yes (prod) | Full transcript download; region `eu-central-1` |
| `RECALL_WEBHOOK_SECRET` | recommended | See **Webhook signature** below |
| `SUPABASE_ACCESS_TOKEN` | migrations | `sbp_…` for `run_supabase_migration.py` |
| `DATABASE_URL` | alt migrations | Direct Postgres instead of Management API |

## Webhook signature (`RECALL_WEBHOOK_SECRET`)

**Status: implemented.** `routers/webhook.py` → `_verify_recall_signature()`.  
**Do not** claim it is unimplemented — outdated before June 2026.

| Secret set? | Behavior |
|-------------|----------|
| **Yes** | Svix headers required (`webhook-id`, `webhook-timestamp`, `webhook-signature` or `svix-*`). Invalid → **403**. |
| **No** | Accepted with log warning — local dev only. |

**Smoke test:** `python scripts/test_webhook_sig.py`. **403 troubleshooting:** `docs/STATUS.md` → Webhook signature.

## Done (Phase 0–1)

- [x] Webhook pipeline: Recall → Claude → Supabase
- [x] Render deploy, stable webhook URL in Recall
- [x] GitHub: `kristinavigovska-collab/english-agent`
- [x] Recall webhook signature verification
- [x] Personal Gmail disconnected from Recall

## Done (Phase 2 — partial)

- [x] Live dashboard + expandable grammar + lesson topic plaque
- [x] Student goal, study plan, intensity presets (`intensity_config`, migration 006)
- [x] Sidebar: collapsible goal/plan; curriculum UI (placeholder classes)
- [x] Analytics view: activity heatmap + general progress tab
- [x] Programs view: catalog, detail page, EUR plan cards (UI only)
- [x] Cross-lesson error patterns, stuck topics, plan multiplier
- [x] API: `PATCH /goal`, `POST /practice`; migrations 001–005 wired
- [x] `lessons.lesson_topic` from Recall webhook / calendar metadata (migration 005)

## Next (Phase 2 — remaining)

**Test student:** `kristina.vigovska@gmail.com` → Кристина, B2 goal (`services/student_profiles.py`).

### P0 — live lesson

1. **Recall:** Connect school/test Google; calendar **English Lessons** only; recording preferences on.
2. **Lesson test:** Calendar event + Meet + guest email → verify `reports` + `lesson_topic`.
3. **Migrations:** Confirm **005** and **006** applied on Supabase prod.

### P1 — programs backend (after UI)

1. ~~Migration `007`~~ — `007_add_programs_catalog.sql` in repo; **apply on Supabase** (`docs/PROGRAMS.md`).
2. `GET /api/programs`, `GET/POST /api/students/{id}/enrollment` — replace `localStorage.enrolled_program_id`.
3. Wire sidebar **curriculum** to enrolled program (single source of truth).
4. Optional `008+`: `curriculum_units`, `lessons.program_id` on webhook.

### P2 — product

- Student login (magic link); agent rubric tuning on real transcripts
- Checkout / Stripe for per-program subscription
- Replace curriculum + catalog placeholders with school materials API

**Before a lesson:** `docs/LESSON_DAY.md`. Pitfalls: `docs/STATUS.md`.

## Do not

- Commit `.env` or `ngrok` binary
- Use Vercel (BackgroundTasks + long Claude calls — use Render)
- Re-connect personal Gmail without updating Google Cloud **Test users**
- Suggest implementing webhook verification — it exists; fix env/config instead
- Treat `localStorage` alone as production enrollment on live dashboard (server `student_enrollments` is source of truth after plan selection)
- Add new program/pricing truth only in `dashboard.js` without a migration + API plan

## Commands

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Migrations (see docs/MIGRATIONS.md)
python scripts/run_supabase_migration.py 005_add_lesson_topic.sql
python scripts/run_supabase_migration.py 006_add_study_intensity_preset.sql
python scripts/run_supabase_migration.py 007_add_programs_catalog.sql
python scripts/run_supabase_migration.py 007_add_programs_catalog.sql

# Ops / debug
python scripts/reprocess_lesson.py --help
python scripts/test_webhook_sig.py

# Tests (install pytest first: pip install pytest)
python -m pytest tests/
```
