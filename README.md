# English Lesson Analyzer

> **Agents:** read [`AGENTS.md`](AGENTS.md) first, then [`docs/STATUS.md`](docs/STATUS.md).

SaaS-сервис анализа уроков английского языка.  
Принимает транскрипты от **Recall.ai**, анализирует речь студента с помощью **Claude claude-opus-4-8**, сохраняет результаты в **Supabase** и отображает прогресс на HTML-дашборде.

---

## Архитектура

```
Recall.ai  ──POST──►  /webhook/recall
                            │
                    background task
                            │
                    ┌───────▼───────┐
                    │ Claude claude-opus-4-8  │  ← анализ транскрипта
                    └───────┬───────┘
                            │ JSON-отчёт
                    ┌───────▼───────┐
                    │   Supabase    │  ← students / lessons / reports
                    └───────┬───────┘
                            │
          GET /api/students/{id}/reports
          GET /api/dashboard/{id}        ──► HTML дашборд
```

---

## Быстрый старт

### 1. Клонируем и устанавливаем зависимости

```bash
git clone <repo-url>
cd english-agent

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Настраиваем переменные окружения

```bash
cp .env.example .env
# Открываем .env и вписываем ключи
```

| Переменная | Где взять |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `SUPABASE_URL` | Settings → API → Project URL |
| `SUPABASE_KEY` | Settings → API → service_role или anon key |
| `RECALL_WEBHOOK_SECRET` | Recall dashboard → Webhooks; `whsec_…`. Details: [`AGENTS.md`](AGENTS.md) |
| `RECALL_API_KEY` | Recall dashboard → API keys (for full transcript download) |
| `RECALL_REGION` | `eu-central-1` (EU workspace) |
| `SUPABASE_ACCESS_TOKEN` | Optional — `sbp_…` for `scripts/run_supabase_migration.py` |

### 3. Создаём таблицы в Supabase

**Базовая схема** — выполните в **Supabase SQL Editor** (один раз на новый проект):

```sql
CREATE TABLE students (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lessons (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id    UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
    recall_bot_id TEXT,
    transcript    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reports (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lesson_id        UUID REFERENCES lessons(id) ON DELETE CASCADE NOT NULL,
    student_id       UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
    grammar_errors   JSONB    DEFAULT '[]',
    vocabulary_level TEXT,
    fluency_score    FLOAT,
    weak_topics      JSONB    DEFAULT '[]',
    recommendations  JSONB    DEFAULT '[]',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON lessons (student_id);
CREATE INDEX ON reports (student_id);
CREATE INDEX ON reports (lesson_id);
```

**Расширения** (цель, план, трекер, паттерны ошибок) — миграции `001`–`004`:

```bash
python scripts/run_supabase_migration.py 001_add_student_goal.sql
# … см. docs/MIGRATIONS.md
```

Полный список колонок и таблиц: [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md).

### 4. Запускаем сервер

```bash
uvicorn main:app --reload --port 8000
```

Документация API доступна по адресу: <http://localhost:8000/docs>

### 5. Деплой на Render (постоянный URL для Recall)

1. Залейте репозиторий на GitHub.
2. [render.com](https://render.com) → **New +** → **Blueprint** (или **Web Service** из репозитория).
3. Подключите репозиторий — Render подхватит `render.yaml`.
4. В **Environment** добавьте переменные из `.env`:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `RECALL_WEBHOOK_SECRET` (опционально)
5. После деплоя URL будет вида `https://english-agent-xxxx.onrender.com`.
6. В Recall → Webhooks укажите:
   `https://english-agent-xxxx.onrender.com/webhook/recall`

На бесплатном плане сервис «засыпает» без трафика (~50 с на первый запрос после простоя). Для урока достаточно один раз открыть `/` за минуту до звонка.

---

## API

### `POST /webhook/recall`

Принимает вебхук от Recall.ai с транскриптом звонка.

**Пример payload:**
```json
{
  "event": "bot.transcription",
  "data": {
    "bot_id": "bot_abc123",
    "metadata": {
      "student_name": "Ivan Petrov",
      "student_email": "ivan@example.com"
    },
    "transcript": [
      {
        "speaker": "Ivan",
        "words": [
          {"text": "Hello,"},
          {"text": "I"},
          {"text": "want"},
          {"text": "to"},
          {"text": "practice."}
        ]
      }
    ]
  }
}
```

**Ответ:**
```json
{"status": "accepted", "event": "bot.transcription"}
```

Анализ выполняется **в фоне** — ответ возвращается мгновенно.

---

### `GET /api/students/{student_id}/reports`

Возвращает отчёты студента, цель, план обучения, трекер и паттерны ошибок.

**Ответ (сокращённо):**
```json
{
  "student_id": "uuid",
  "student_name": "Ivan Petrov",
  "student_email": "ivan@example.com",
  "target_cefr_level": "B2",
  "target_duration_weeks": 6,
  "study_plan": {
    "hours_per_week": 4.5,
    "progress_percent": 12.0,
    "status": "on_track",
    "status_message": "…"
  },
  "progress_tracker": {
    "completed_days": 3,
    "streak": 2,
    "days": []
  },
  "error_tracking": {
    "stuck_topics": [],
    "patterns": []
  },
  "reports": [
    {
      "id": "uuid",
      "fluency_score": 6.5,
      "vocabulary_level": "B1",
      "grammar_errors": [
        {
          "error": "I have went to school",
          "correction": "I went to school",
          "explanation": "Past Simple для завершённого действия в прошлом.",
          "error_category": "past_tense"
        }
      ],
      "weak_topics": ["past perfect"],
      "recommendations": ["Practice past simple vs past perfect"],
      "lesson_date": "2025-01-15T10:00:00Z"
    }
  ]
}
```

---

### `PATCH /api/students/{student_id}/goal`

Задаёт или обновляет цель обучения (CEFR, срок, тип цели, расписание). Пересчитывает `study_plan` и `progress_tracker`.

---

### `POST /api/students/{student_id}/practice`

Отмечает самостоятельную практику за день (`completed_minutes`, опционально `progress_date`).

---

### `GET /api/dashboard/{student_id}`

Возвращает HTML-дашборд студента с последним отчётом и историей уроков.

---

## Настройка Recall.ai

1. Создайте бот через Recall.ai API, передав **metadata** студента:
   ```json
   {
     "meeting_url": "https://meet.google.com/xxx",
     "metadata": {
       "student_name": "Ivan Petrov",
       "student_email": "ivan@example.com"
     },
     "bot_name": "Yappi Tutor"
   }
   ```

2. Зарегистрируйте вебхук в настройках Recall.ai:
   - URL: `https://your-domain.com/webhook/recall`
   - Events: `recording.done`, `transcript.data`, `transcript.done` (legacy: `bot.transcription`, `bot.transcription_complete`)

3. Для локального тестирования используйте [ngrok](https://ngrok.com):
   ```bash
   ngrok http 8000
   # Используйте полученный URL как адрес вебхука
   ```

---

## Структура проекта

```
english-agent/
├── main.py                       # FastAPI приложение
├── requirements.txt
├── render.yaml                   # Render Blueprint
├── .env.example
├── AGENTS.md                     # Контекст для AI-агентов
│
├── models/
│   └── schemas.py                # Pydantic-модели
│
├── services/
│   ├── claude_service.py         # Анализ через Anthropic API
│   ├── recall_service.py         # Recall API (транскрипты)
│   ├── supabase_service.py       # CRUD Supabase
│   ├── transcript_service.py     # Парсинг и merge транскриптов
│   ├── student_profiles.py       # Профили студентов для Claude
│   ├── goal_plan_service.py      # План обучения
│   ├── daily_progress_service.py # Трекер дней
│   └── error_pattern_service.py  # Паттерны ошибок
│
├── routers/
│   ├── webhook.py                # POST /webhook/recall (+ signature verify)
│   └── reports.py                # Reports, goal, practice, dashboard
│
├── scripts/
│   ├── migrations/               # SQL 001–004
│   ├── run_supabase_migration.py
│   ├── reprocess_lesson.py       # CLI: перезапуск анализа по bot_id
│   └── test_webhook_sig.py       # Smoke-test верификации подписи
│
├── tests/                        # pytest (goal plan, error patterns)
│
├── docs/
│   ├── STATUS.md
│   ├── ARCHITECTURE.md
│   ├── MIGRATIONS.md
│   ├── LESSON_DAY.md
│   └── DEPLOY_RENDER.md
│
└── static/
    ├── dashboard.html            # HTML shell
    ├── dashboard.css             # Dashboard styles
    └── dashboard.js              # Логика дашборда, fetch API
```

---

## Ключевые технические решения

| Решение | Причина |
|---|---|
| **Prompt caching** на системном промпте | Системный промпт (~600 токенов) одинаков для каждого анализа — кэш экономит ~90% токенов на повторных вызовах |
| **Structured output** (`output_config.format`) | Гарантирует валидный JSON от модели без парсинга с ошибками |
| **BackgroundTasks** для обработки вебхука | Recall.ai ожидает быстрый ответ `200 OK`; тяжёлый анализ идёт асинхронно |
| **Upsert студента по email** | Предотвращает дубликаты при повторных уроках одного студента |
