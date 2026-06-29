# Project status

Last updated: 2026-06-23

## Decisions

| Topic | Decision |
|-------|----------|
| Hosting | Render `english-agent.onrender.com` (not Vercel) |
| Recall webhook | `/webhook/recall` on Render URL |
| School calendar | One Google account/calendar for school on Recall |
| Student ID | Email from calendar guest or metadata; upsert `students` |
| DB column | `lessons.recall_bot_id` (code matches DB) |
| Personal Gmail | Disconnected from Recall; removed from GCP test users |
| Lesson topic | Calendar event title / Recall metadata → `lessons.lesson_topic` via webhook |
| Study intensity | Presets `once_week` / `few_times_week` / `daily` on `students`; drives plan + curriculum pacing |
| Programs (June 2026) | Per-program subscription model in **UI**; catalog + plans in `dashboard.js`; enrollment in `localStorage` only |
| Lesson format (product) | 30 min practice (yBook + AI) + 30 min live micro class — stated on program detail page |
| Dashboard accent | `#6687FF` (CSS `--accent`) |

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

**Lessons & reports (backend)**

- [x] Goal + study plan (`goal_plan_service`, migrations 001–002)
- [x] Study intensity presets (`intensity_config`, migration 006, `PATCH /goal`)
- [x] Daily progress backend — `daily_progress`, `POST /practice` (migration 003)
- [x] Error pattern tracking — stuck/new badges, plan +10% multiplier (migration 004)
- [x] `lessons.lesson_topic` column + webhook wiring (migration 005)
- [x] `PATCH /api/students/{id}/goal`

**Dashboard UI**

- [x] App nav: Home · Programs · Analytics (English labels)
- [x] Home: Class summary tabs, sidebar goal/plan, curriculum list (placeholder classes)
- [x] Analytics: activity heatmap, usage breakdown, **Общий прогресс** tab with pace alerts
- [x] Programs: catalog (General / Business / Special), program detail page, horizontal EUR plan cards
- [x] Expandable grammar, stuck-topic block, lesson topic plaque
- [x] Selected program card in catalog grid; «Посмотреть программу» → detail

### Phase 2b — Programs & subscriptions (UI only)

| Done in UI | Not built yet |
|------------|----------------|
| `PROGRAM_CATALOG` (16 placeholder programs) | `programs` table in Supabase |
| Program detail + 5 EUR plans (free_trial … intensive) | `program_plans` in DB |
| `localStorage.enrolled_program_id` | `student_enrollments` / API |
| Checkout links `/checkout?plan=…&program=…` | Checkout route, Stripe |
| Sidebar curriculum (`PLACEHOLDER_CEFR_CURRICULUM`) | Linked to enrolled program |

**Agent rule:** do not assume enrollment in DB or that programs affect the Recall webhook until Phase 3 backend lands.

### P0 — test one real lesson

1. Recall **Connect** with school/test Google (add email to GCP **Audience → Test users** first).
2. Google Calendar: calendar **English Lessons** only; event with **Meet link** + student guest email.
3. Recall: **Recording preferences** not all `false`; `bot_name`: **Yappi Tutor**.
4. Before lesson: open `https://english-agent.onrender.com/` (wake Render).
5. After lesson: Supabase `reports` + `lessons.lesson_topic` + Recall webhook logs. Re-run if needed: `scripts/reprocess_lesson.py`.
6. Apply migrations **005** and **006** on Supabase if columns missing.

### P1 — programs backend (next after live lesson proof)

- [x] Migration `007_add_programs_catalog.sql` — `programs`, `program_plans`, `student_enrollments` + seed (file in repo; **apply on Supabase**)
- [x] `docs/PROGRAMS.md` — catalog, plans, enrollment model, planned API
- [ ] `GET /api/programs`, `GET /api/students/{id}/enrollment`
- [ ] Replace `localStorage.enrolled_program_id` with server state
- [ ] Sidebar curriculum driven by enrolled program (not separate placeholder)
- [ ] Optional: `lessons.program_id` on webhook

### P1 — student-facing (other)

- [ ] Student login: email → magic link (no UUID in URL)
- [ ] UI to mark practice (`POST /practice` exists; curriculum Practice button is stub)
- [ ] Real platform session time (heatmap «время на платформе»)

### P2 — school ops & monetization

- Checkout / Stripe for per-program subscription
- `schools` table + school calendar account docs for teachers
- Auto-email “report ready” after webhook
- Wire book-class / practice curriculum overlays to scheduling + materials

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
| Programs data | Catalog, plans, enrollment — **client-only** in `dashboard.js` / `localStorage` |
| Curriculum vs Programs | Two separate placeholders; not synced |
| Checkout | URL stub only; no payment integration |
| Activity data model | `daily_progress` = one row per day, one `source` (`lesson` \| `practice`) |
| Mark practice UI | `POST /practice` API works; no student-facing button in dashboard yet |
| UI vs Claude | Demo shows pronunciation/wpm; API does not — hidden on live load |
| Render free | Cold start ~30–50 s; ping `/` before lessons |
| Calendar filter | Use separate Google calendar; Recall UI limited |
| pytest | Not in `requirements.txt` — `pip install pytest` for `tests/` |
| Migrations 005–007 | SQL files exist; confirm applied on Supabase prod |

## Pitfalls we hit

- `supabase==2.10` rejects `sb_secret_` → use `>=2.16`
- `meeting_id` in old docs vs `recall_bot_id` in DB — code uses `recall_bot_id`
- GCP OAuth **Test users** required while app in Testing
- Calendar Connect needs **calendar.events.readonly** scope + Calendar API enabled
- “No meeting link” on event → bot will not join
- Webhook may not persist if Render restarts mid-BackgroundTask — use `scripts/reprocess_lesson.py`
- Agents often cite old docs saying webhook secret is “unused” — it is **implemented**; check env sync if webhooks fail
- After editing `dashboard.js` / `dashboard.css`, bump `?v=` in `dashboard.html` for cache bust on Render
- Curriculum scroll anchor: use layout-settled scroll (`rAF` + short delay) after goal/plan collapse toggles
- Do not document «Активность» on Home — it lives under **Analytics** since June 2026
- `enrolled_program_id` in localStorage does **not** persist across devices or affect lesson pipeline

## Links

- **Lesson day checklist:** `docs/LESSON_DAY.md`
- **Schema migrations:** `docs/MIGRATIONS.md`
- **Programs model:** `docs/PROGRAMS.md`
- Deploy: `docs/DEPLOY_RENDER.md`
- Architecture: `docs/ARCHITECTURE.md`
