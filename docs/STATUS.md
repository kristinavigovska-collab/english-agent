# Project status

Last updated: 2026-06-20

## Decisions

| Topic | Decision |
|-------|----------|
| Hosting | Render `english-agent.onrender.com` (not Vercel) |
| Recall webhook | `/webhook/recall` on Render URL |
| School calendar | One Google account/calendar for school on Recall |
| Student ID | Email from calendar guest or metadata; upsert `students` |
| DB column | `lessons.recall_bot_id` (code matches DB) |
| Personal Gmail | Disconnected from Recall; removed from GCP test users |

## Phase 0–1 — completed

- [x] FastAPI app: webhook, reports API, static dashboard shell
- [x] Claude structured analysis → `reports` table
- [x] Supabase: tables + `fluency_score` as float
- [x] `supabase>=2.16` for `sb_secret_` keys
- [x] GitHub + Render Blueprint (`render.yaml`)
- [x] Recall webhook endpoint updated from ngrok to Render
- [x] Google OAuth for Recall Calendar V1
- [x] Recall webhook signature verification (`routers/webhook.py`)
- [x] Full Recall transcript download via `recall_service.py`
- [x] Live dashboard wired to reports API

## Phase 2 — in progress

### Completed (June 2026)

- [x] Goal + study plan (`goal_plan_service`, migrations 001–002)
- [x] Daily progress tracker — modal UI, `POST /practice` (migration 003)
- [x] Error pattern tracking — stuck/new badges, plan +10% multiplier (migration 004)
- [x] Dashboard: goal strip above tabs, expandable grammar, stuck-topic block
- [x] `PATCH /api/students/{id}/goal`

### P0 — test one real lesson

1. Recall **Connect** with school/test Google (add email to GCP **Audience → Test users** first).
2. Google Calendar: calendar **English Lessons** only; event with **Meet link** + student guest email.
3. Recall: **Recording preferences** not all `false`; `bot_name`: **Yappi Tutor**.
4. Before lesson: open `https://english-agent.onrender.com/` (wake Render).
5. After lesson: Supabase `reports` + Recall webhook logs. Re-run if needed: `scripts/reprocess_lesson.py`.

### P1 — student-facing (remaining)

- [ ] `lessons.lesson_topic` from calendar event title / school materials (UI falls back to `weak_topics`)
- [ ] Student login: email → magic link (no UUID in URL)

### P2 — school ops

- `schools` table + school calendar account docs for teachers
- Auto-email “report ready” after webhook

## Webhook signature (`RECALL_WEBHOOK_SECRET`)

> **For AI agents:** verification is **already implemented**. Do not list “add webhook HMAC” as a todo.

| | |
|---|---|
| **Code** | `routers/webhook.py` → `_verify_recall_signature()` |
| **Algorithm** | Svix-style HMAC-SHA256 (`v1,<base64-sig>`) |
| **Headers** | `webhook-id`, `webhook-timestamp`, `webhook-signature` (or `svix-*` aliases) |
| **Production** | Set `RECALL_WEBHOOK_SECRET=whsec_…` on **Render** and in **Recall → Webhooks** (must match) |
| **Dev / unset** | Webhooks accepted without verification; warning in logs |
| **Test** | `python scripts/test_webhook_sig.py` |

### Troubleshooting 403 on webhook

| Symptom | Fix |
|---------|-----|
| `Missing webhook signature headers` | Recall not sending signed webhooks — check webhook endpoint config |
| `Invalid webhook signature` | `RECALL_WEBHOOK_SECRET` on Render ≠ Recall dashboard secret |
| `Webhook timestamp out of tolerance` | Server clock skew; retry or check Render time |
| `Webhook secret misconfigured` | Secret is not valid base64 after `whsec_` strip — copy again from Recall |

## Known gaps

| Gap | Notes |
|-----|--------|
| Dashboard auth | `student_id` in URL is public — anyone with UUID sees reports |
| Lesson topic (live) | UI ready; `lessons.lesson_topic` not wired — falls back to `weak_topics` |
| UI vs Claude | Demo shows pronunciation/wpm; API does not — hidden on live load |
| Render free | Cold start ~30–50 s; ping `/` before lessons |
| Calendar filter | Use separate Google calendar; Recall UI limited |
| pytest | Not in `requirements.txt` — `pip install pytest` for `tests/` |

## Pitfalls we hit

- `supabase==2.10` rejects `sb_secret_` → use `>=2.16`
- `meeting_id` in old docs vs `recall_bot_id` in DB — code uses `recall_bot_id`
- GCP OAuth **Test users** required while app in Testing
- Calendar Connect needs **calendar.events.readonly** scope + Calendar API enabled
- “No meeting link” on event → bot will not join
- Webhook may not persist if Render restarts mid-BackgroundTask — use `scripts/reprocess_lesson.py`
- Agents often cite old docs saying webhook secret is “unused” — it is **implemented**; check env sync if webhooks fail
- After editing `dashboard.js`, bump `?v=` in `dashboard.html` for cache bust on Render

## Links

- **Lesson day checklist:** `docs/LESSON_DAY.md`
- **Schema migrations:** `docs/MIGRATIONS.md`
- Deploy: `docs/DEPLOY_RENDER.md`
- Architecture: `docs/ARCHITECTURE.md`
