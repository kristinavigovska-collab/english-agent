# Деплой на Render (шаг 1)

## 1. GitHub

```bash
cd /Users/kristina/english-agent
git add render.yaml runtime.txt requirements.txt README.md .gitignore \
  services/ routers/ models/ main.py static/ docs/
git commit -m "Add Render deployment and Supabase schema alignment"
```

Создайте репозиторий на https://github.com/new (без README), затем:

```bash
git remote add origin https://github.com/YOUR_USER/english-agent.git
git push -u origin main
```

## 2. Render

1. https://dashboard.render.com → **New +** → **Blueprint**
2. Подключите GitHub → репозиторий `english-agent`
3. Render прочитает `render.yaml`
4. Введите секреты при создании:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL` — `https://esmtlsjbovkqtzrheijl.supabase.co`
   - `SUPABASE_KEY` — ваш `sb_secret_...`
5. **Apply** → дождитесь **Live**

Постоянный URL: `https://english-agent.onrender.com` (имя может отличаться).

Проверка: откройте `https://ВАШ-URL.onrender.com/` → `{"status":"ok",...}`

## 3. Recall webhook

Recall Dashboard → **Webhooks** → Add / Edit:

| Поле | Значение |
|------|----------|
| URL | `https://ВАШ-URL.onrender.com/webhook/recall` |
| Events | `bot.transcription`, `bot.transcription_complete`, `bot.transcript` |

Сохраните. Локальный ngrok больше не нужен.

## 4. Перед уроком

За 1–2 минуты откройте в браузере корень сайта — free tier «просыпается» (~30–50 с).

## 5. После урока

Supabase → Table Editor → `reports` — новая строка.

Студент: `https://ВАШ-URL.onrender.com/api/dashboard/{student_id}`  
(`student_id` из таблицы `students`).
