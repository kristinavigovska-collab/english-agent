# Деплой на Render

## 1. GitHub

Репозиторий: `kristinavigovska-collab/english-agent` (или ваш fork).

```bash
git remote -v   # проверить origin
git push origin main
```

Render деплоит из `main` по `render.yaml` (auto-deploy on push).

## 2. Render

1. https://dashboard.render.com → **New +** → **Blueprint** (или подключить существующий сервис)
2. Подключите GitHub → репозиторий `english-agent`
3. Render прочитает `render.yaml`
4. **Environment** — обязательные переменные:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL` — `https://esmtlsjbovkqtzrheijl.supabase.co`
   - `SUPABASE_KEY` — `sb_secret_…` (нужен `supabase>=2.16`)
   - `RECALL_API_KEY`, `RECALL_REGION=eu-central-1`
   - `RECALL_WEBHOOK_SECRET` — `whsec_…` (рекомендуется для prod)
5. **Apply** → дождитесь **Live**

Постоянный URL: `https://english-agent.onrender.com`

Проверка: откройте `/` → `{"status":"ok",...}`

## 3. Recall webhook

Recall Dashboard → **Webhooks** → Add / Edit:

| Поле | Значение |
|------|----------|
| URL | `https://english-agent.onrender.com/webhook/recall` |
| Signing secret | тот же `whsec_…`, что в Render `RECALL_WEBHOOK_SECRET` |
| Events | `recording.done`, `transcript.data`, `transcript.done` (+ legacy: `bot.transcription`, `bot.transcription_complete`, `bot.transcript`) |

Сохраните. Локальный ngrok нужен только для dev.

**403 на webhook:** см. `docs/STATUS.md` → Webhook signature.

## 4. Supabase migrations

На prod-проекте примените миграции 001–004 если ещё не применены: [`docs/MIGRATIONS.md`](MIGRATIONS.md).

## 5. Перед уроком

За 1–2 минуты откройте в браузере корень сайта — free tier «просыпается» (~30–50 с). Чеклист: [`LESSON_DAY.md`](LESSON_DAY.md).

## 6. После урока

Supabase → Table Editor → `reports` — новая строка.

Студент: `https://english-agent.onrender.com/api/dashboard/{student_id}`  
(`student_id` из таблицы `students`).

Если webhook не дошёл: `python scripts/reprocess_lesson.py --bot-id …`
