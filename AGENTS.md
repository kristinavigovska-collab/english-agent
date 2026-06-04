# Agent context — English Lesson Analyzer

**Read this first** in a new chat. Details: `docs/STATUS.md`, `docs/ARCHITECTURE.md`.

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
main.py                 # App entry, mounts routers
routers/webhook.py      # Recall → background analysis
routers/reports.py      # Reports API + dashboard HTML inject
services/claude_service.py
services/supabase_service.py
models/schemas.py
static/dashboard.html   # UI; demo at /dashboard, live at /api/dashboard/{id}
static/dashboard.js     # fetches /api/students/{id}/reports
render.yaml             # Render deploy
```

## DB (Supabase)

- `students` — upsert by `email`
- `lessons` — `recall_bot_id` (not `meeting_id`; code uses `recall_bot_id`)
- `reports` — `grammar_errors`, `vocabulary_level`, `fluency_score` (float), `weak_topics`, `recommendations`

## Env vars (see `.env.example`)

`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` (`sb_secret_…` needs `supabase>=2.16`), optional `RECALL_WEBHOOK_SECRET` (not verified in code yet).

## Done (Phase 0–1)

- [x] Webhook pipeline: Recall → Claude → Supabase
- [x] Render deploy, stable webhook URL in Recall
- [x] GitHub: `kristinavigovska-collab/english-agent`
- [x] Supabase schema aligned with code
- [x] Personal Gmail **disconnected** from Recall (privacy); OAuth app name in Google: “English Lesson Analyzer”

## Next (Phase 2 — priority)

1. **Recall:** Connect **school / test** Google (not personal gmail). Separate calendar `English Lessons` only; enable recording preferences.
2. **Dashboard:** Live data wired; optional: extend Claude schema for pronunciation/wpm fields.
3. **Student access:** Magic link or lookup by email (no auth today — anyone with UUID sees dashboard).
4. **Lesson test:** Calendar event with **Google Meet** + student guest email → verify row in `reports`.

See `docs/STATUS.md` for checklist and pitfalls.

## Do not

- Commit `.env` or `ngrok` binary
- Use Vercel (BackgroundTasks + long Claude calls — use Render)
- Re-connect personal `kristina.vigovska@gmail.com` without updating Google Cloud **Test users**

## Commands

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
