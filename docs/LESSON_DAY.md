# Подготовка к уроку — бот Recall + отчёт

Чеклист на **вечер перед уроком** и **утро в день урока**.  
Сервер: **https://english-agent.onrender.com**

---

## Сегодня (настройка один раз)

### 1. Google Cloud — доступ к календарю

Приложение OAuth в режиме **Testing** → в календарь могут подключаться только **Test users**.

1. [Google Cloud Console](https://console.cloud.google.com/) → проект **Yappi Tutor** / **English Lesson Analyzer**
2. **APIs & Services** → **OAuth consent screen** → **Test users**
3. **Add users** → email **школьного** Google (тот, с которым будет календарь уроков), **не** личный gmail, если он отключён от Recall
4. Убедись, что включены **Google Calendar API** и scope `calendar.events.readonly`

### 2. Recall — подключить календарь

1. [Recall Dashboard](https://eu-central-1.recall.ai/) (регион **eu-central-1**)
2. **Calendar** (Calendar V1) → **Connect** → войти **школьным** Google
3. Выбери отдельный календарь, например **English Lessons** (не весь основной календарь — так бот не полезет на личные встречи)
4. **Recording preferences** — хотя бы одна опция **включена** и имя бота **`Yappi Tutor`**:

   ```json
   {
     "record_non_host": false,
     "record_recurring": false,
     "record_external": true,
     "record_internal": false,
     "record_confirmed": true,
     "record_only_host": false,
     "bot_name": "Yappi Tutor"
   }
   ```

   Не оставляй все переключатели `false`, иначе бот не придёт.

### 3. Recall — webhook

**Settings** → **Webhooks** → URL должен быть **ровно**:

```
https://english-agent.onrender.com/webhook/recall
```

События (events) — **обязательно все**:

| Событие | Зачем |
|---------|--------|
| `recording.done` | Запуск полной транскрипции после урока |
| `transcript.done` | Скачать полный транскрипт и создать отчёт |
| `transcript.data` | Накапливать реплики во время урока (опционально, но полезно) |
| `bot.transcription` / `bot.transcript` / `bot.transcription_complete` | Legacy Calendar V1 (если есть) |

**Render → Environment:** добавь `RECALL_API_KEY` (API key из Recall dashboard, регион `eu-central-1`).

Сохрани. Старый ngrok URL удалить, если остался.

### 4. Render — секреты

[Render Dashboard](https://dashboard.render.com/) → сервис **english-agent** → **Environment**:

| Переменная | Должна быть задана |
|------------|-------------------|
| `ANTHROPIC_API_KEY` | да |
| `SUPABASE_URL` | `https://esmtlsjbovkqtzrheijl.supabase.co` |
| `SUPABASE_KEY` | `sb_secret_...` (не anon key) |

После изменений — дождись **Live**.

### 5. Проверка сервера (2 минуты)

Открой в браузере:

- https://english-agent.onrender.com/ → должно быть `{"status":"ok",...}`
- https://english-agent.onrender.com/dashboard → демо без плашки «Загрузка отчётов…»

---

## Сегодня — создать событие на завтра

В Google Calendar (**календарь English Lessons**):

| Поле | Что указать |
|------|-------------|
| Название | Например: `English lesson — Имя студента` |
| Время | Завтра, точное время урока |
| **Видеовстреча** | **Google Meet** — ссылка должна появиться в событии |
| **Гости** | Email студента (реальный) — по нему создаётся запись в `students` |

**Частые ошибки:**

- Нет Meet → бот **не зайдёт** («No meeting link»)
- Студент без email в гостях → в базе будет фиктивный `@recall.local`
- Событие только в личном календаре, не в **English Lessons** → Recall может не увидеть

За **10–15 минут до урока** открой Meet и проверь, что ссылка работает.

---

## Завтра — за 5 минут до урока

1. Открой https://english-agent.onrender.com/ и подожди ~30–50 сек (пробуждение free tier)
2. Убедись, что встреча в календаре **подтверждена** и с Meet
3. Зайди в Meet **как организатор** (школьный Google) — бот обычно заходит после старта звонка

---

## Во время урока

- Говори по-английски **вслух** — иначе не будет транскрипта для Claude
- Дождись, пока в участниках появится **Yappi Tutor**
- Урок лучше **15+ минут** — короткий тест даёт слабый отчёт

---

## После урока (10–30 минут)

### 1. Supabase

[Supabase](https://supabase.com) → проект → **Table Editor**:

| Таблица | Что проверить |
|---------|----------------|
| `students` | новая строка с email студента |
| `lessons` | строка с `recall_bot_id` |
| `reports` | грамматика, CEFR, fluency |

Если `reports` пусто — см. раздел «Если что-то пошло не так».

### 2. Дашборд студента

1. `students` → скопируй **id** (UUID)
2. Ссылка: `https://english-agent.onrender.com/api/dashboard/ВСТАВЬ_UUID`

### 3. Логи (если пусто в Supabase)

Render → **english-agent** → **Logs** — ищи `Report saved` или ошибки.

Recall → **Webhooks** → история доставки на `/webhook/recall`.

---

## Если что-то пошло не так

| Симптом | Что проверить |
|---------|----------------|
| Бот не зашёл в Meet | Meet в событии; календарь подключён в Recall; recording preferences не все false |
| Бот был, отчёта нет | Webhook URL; Render logs; события transcription в Recall |
| Render спал | Открыть `/` **до** урока; во время урока не закрывать вкладку с health |
| OAuth «access blocked» | Email в GCP **Test users** |
| Студент «Unknown» | Email гостя в календаре |

---

## Быстрые ссылки

| Что | URL |
|-----|-----|
| Сервер | https://english-agent.onrender.com/ |
| Демо UI | https://english-agent.onrender.com/dashboard |
| Webhook | `POST https://english-agent.onrender.com/webhook/recall` |
| Recall | https://eu-central-1.recall.ai/ |
| Supabase | https://supabase.com/dashboard/project/esmtlsjbovkqtzrheijl |

---

*После первого успешного урока отметь в `docs/STATUS.md` пункт P0.*
