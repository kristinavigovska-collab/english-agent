# Project status

Last updated: 2026-06-07

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
- [x] Google OAuth app “Yappi Tutor” / consent “English Lesson Analyzer” for Calendar V1
- [x] Recall webhook signature verification — **done** (`routers/webhook.py`, Svix HMAC-SHA256; see below)
- [x] Full Recall transcript download via `recall_service.py`
- [x] Live dashboard wired to reports API (`static/dashboard.js`)

## Phase 2 — in progress

### P0 — test one real lesson

1. Recall **Connect** with school/test Google (add email to GCP **Audience → Test users** first).
2. Google Calendar: calendar **English Lessons** only; event with **Meet link** + student guest email.
3. Recall: **Recording preferences** not all `false`; `bot_name`: **Yappi Tutor**.
4. Before lesson: open `https://english-agent.onrender.com/` (wake Render).
5. After lesson: Supabase `reports` + Recall webhook logs.

### P1 — student-facing

- [x] Wire `static/dashboard.html` to API (`__STUDENT_ID__` + `fetch` reports)
- [x] Map UI to Claude fields (grammar errors with `explanation`, CEFR, fluency, weak topics, recommendations)
- [x] Lesson topic plaque above grammar card (demo `lesson_topic`; live fallback from `weak_topics`)
- [ ] `lessons.lesson_topic` from school materials / calendar event title
- [ ] Student login: email → magic link (no UUID in URL)

### P2 — school ops

- `schools` table + school calendar account docs for teachers.
- Auto-email “report ready” after webhook.

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
| Lesson topic (live) | UI ready; DB field `lessons.lesson_topic` not wired yet — falls back to `weak_topics` |
| UI vs Claude | Demo blocks show pronunciation/wpm; API does not — hidden on live load |
| Render free | Cold start ~30–50 s; ping `/` before lessons |
| Calendar filter | Use separate Google calendar; Recall UI limited |

## Pitfalls we hit

- `supabase==2.10` rejects `sb_secret_` → use `>=2.16`
- `meeting_id` in README vs `recall_bot_id` in DB — code uses `recall_bot_id`
- GCP OAuth **Test users** required while app in Testing
- Calendar Connect needs **calendar.events.readonly** scope + Calendar API enabled
- “No meeting link” on event → bot will not join
- Removing Test users ≠ revoking Google access (also delete app in Google permissions)
- Webhook may not persist if Render restarts mid-BackgroundTask — use `scripts/reprocess_lesson.py` to re-run analysis
- Agents often cite old docs saying webhook secret is “unused” — it is **implemented**; check env sync if webhooks fail

## Links

- **Lesson day checklist:** `docs/LESSON_DAY.md`
- Deploy: `docs/DEPLOY_RENDER.md`
- Architecture: `docs/ARCHITECTURE.md`
