# Agent context — English Lesson Analyzer

**Read this first** in a new chat. Details: `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/MIGRATIONS.md`.

## Product

SaaS for an English school: Recall.ai bot joins lessons → transcript → Claude analysis → Supabase → student report (dashboard).

**School model:** one Google Calendar on Recall (school account later). Student = guest email on calendar event. Not “invite agent by email”.

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
routers/webhook.py               # Recall → signature verify → background analysis
routers/reports.py               # Reports API, goal PATCH, practice POST, dashboard HTML
services/claude_service.py       # Transcript → structured LessonAnalysis
services/recall_service.py       # Full transcript download from Recall API
services/supabase_service.py     # CRUD Supabase
services/transcript_service.py   # Parse / merge transcript shapes
services/student_profiles.py     # Per-email profiles for Claude (test student: Кристина)
services/goal_plan_service.py    # Study plan hours, pace, status
services/daily_progress_service.py  # Habit grid, streak, mark practice
services/error_pattern_service.py   # Cross-lesson categories, stuck/new
services/error_category_config.py   # Category catalog + normalization
services/rubric_service.py       # CEFR / scoring helpers
models/schemas.py                # Pydantic API + Claude models
static/dashboard.html            # UI shell; demo at /dashboard, live at /api/dashboard/{id}
static/dashboard.css
static/dashboard.js              # Demo + live; goal strip, modal tracker, error badges
scripts/migrations/              # 001–004 SQL (see docs/MIGRATIONS.md)
scripts/run_supabase_migration.py
scripts/reprocess_lesson.py      # CLI: re-fetch transcript + re-run Claude
scripts/test_webhook_sig.py      # Webhook signature smoke test
tests/                           # test_goal_plan_service, test_error_pattern_service
render.yaml
docs/                            # STATUS, ARCHITECTURE, MIGRATIONS, LESSON_DAY, DEPLOY_RENDER
```

## DB (Supabase)

Base: `students` (upsert by `email`), `lessons` (`recall_bot_id`, `transcript`), `reports` (Claude JSON).

Goal/plan on `students` (migrations 001–002): `target_cefr_level`, `target_date`, `goal_label`, `goal_type`, `target_duration_weeks`, `scenario_description`, tutor/practice schedule fields.

`reports.grammar_errors`: `error`, `correction`, `explanation`, `error_category`.

Also: `daily_progress` (003), `error_pattern_history` (004). Full list: `docs/MIGRATIONS.md`.

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
- [x] Student goal, study plan, daily progress tracker (modal UI)
- [x] Cross-lesson error patterns, stuck topics, plan multiplier
- [x] API: `PATCH /goal`, `POST /practice`; migrations 001–004

## Next (Phase 2 — remaining)

**Test student:** `kristina.vigovska@gmail.com` → Кристина, B2 goal (`services/student_profiles.py`).

1. **Recall:** Connect school/test Google; calendar **English Lessons** only; recording preferences on.
2. **Agent rubric:** Tune CEFR / fluency prompts on real lesson transcripts.
3. **Student access:** Magic link or email lookup (no auth today — UUID in URL is public).
4. **Lesson test:** Calendar event + Meet + guest email → verify `reports` row.
5. **`lesson_topic`:** Wire from calendar event title to `lessons.lesson_topic`.

**Before a lesson:** `docs/LESSON_DAY.md`. Pitfalls: `docs/STATUS.md`.

## Do not

- Commit `.env` or `ngrok` binary
- Use Vercel (BackgroundTasks + long Claude calls — use Render)
- Re-connect personal Gmail without updating Google Cloud **Test users**
- Suggest implementing webhook verification — it exists; fix env/config instead

## Commands

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Migrations (see docs/MIGRATIONS.md)
python scripts/run_supabase_migration.py 004_add_error_pattern_history.sql

# Ops / debug
python scripts/reprocess_lesson.py --help
python scripts/test_webhook_sig.py

# Tests (install pytest first: pip install pytest)
python -m pytest tests/
```
