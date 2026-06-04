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
                    │
                    ▼
              GET /api/students/{id}/reports
              GET /api/dashboard/{id}  (HTML, mock UI)
```

## Webhook handling

File: `routers/webhook.py`

- Events: `bot.transcription`, `bot.transcript`, `bot.transcription_complete`
- Parses transcript (list or segments shape)
- Student: `metadata.student_email` / `participants[0].email` / fallback `{bot_id}@recall.local`
- Background: `get_or_create_student` → `create_lesson` → `analyze_transcript` → `save_report`

## Claude output (stored in `reports`)

- `grammar_errors[]` — error, correction, example
- `vocabulary_level` — CEFR string
- `fluency_score` — 0.0–10.0
- `weak_topics[]`, `recommendations[]`

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Health |
| POST | `/webhook/recall` | Recall ingress |
| GET | `/api/students/{id}/reports` | JSON reports |
| GET | `/api/dashboard/{id}` | HTML dashboard |
| GET | `/dashboard` | Static HTML (no student id) |

## External accounts

- **Render:** env vars from `.env.example`
- **Recall:** Calendar V1 + webhook; EU region
- **Google Cloud:** OAuth client “Yappi Tutor”, redirect to Recall callback; consent screen + test users

## Future (not built)

- `schools`, teacher roles, RLS
- Email magic link auth
- Webhook HMAC verification
- Idempotent webhook / job queue (Render restarts can drop BackgroundTasks on crash — rare)
