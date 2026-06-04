# Project status

Last updated: 2026-06-04

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

## Phase 2 — next work

### P0 — test one real lesson

1. Recall **Connect** with school/test Google (add email to GCP **Audience → Test users** first).
2. Google Calendar: calendar **English Lessons** only; event with **Meet link** + student guest email.
3. Recall: **Recording preferences** not all `false` (e.g. `record_confirmed: true`).
4. Before lesson: open `https://english-agent.onrender.com/` (wake Render).
5. After lesson: Supabase `reports` + Recall webhook logs.

### P1 — student-facing

- [x] Wire `static/dashboard.html` to API (`__STUDENT_ID__` + `fetch` reports) — `static/dashboard.js`
- [x] Map UI to Claude fields only (demo blocks hidden when live data loads)
- [ ] Student login: email → magic link (no UUID in URL)

### P2 — school ops

- `schools` table + school calendar account docs for teachers.
- Auto-email “report ready” after webhook.
- Verify `RECALL_WEBHOOK_SECRET` in `webhook.py`.

## Known gaps

| Gap | Notes |
|-----|--------|
| Dashboard | `/dashboard` = demo; `/api/dashboard/{uuid}` loads live reports |
| Auth | `student_id` in URL is public |
| Webhook signature | `RECALL_WEBHOOK_SECRET` unused |
| UI vs Claude | UI shows pronunciation, wpm, etc.; API does not |
| Render free | Cold start; ping `/` before lessons |
| Calendar filter | Use separate Google calendar; Recall UI limited |

## Pitfalls we hit

- `supabase==2.10` rejects `sb_secret_` → use `>=2.16`
- `meeting_id` in README vs `recall_bot_id` in DB — code uses `recall_bot_id`
- GCP OAuth **Test users** required while app in Testing
- Calendar Connect needs **calendar.events.readonly** scope + Calendar API enabled
- “No meeting link” on event → bot will not join
- Removing Test users ≠ revoking Google access (also delete app in Google permissions)

## Links

- Deploy: `docs/DEPLOY_RENDER.md`
- Architecture: `docs/ARCHITECTURE.md`
