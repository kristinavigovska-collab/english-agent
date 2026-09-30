# Rubrics — шкала оценивания для Claude

Инструкции методиста для анализа уроков. Claude получает **только файл уровня студента**, не весь комплект сразу.

Платформа работает только с уровнями **от Intermediate и выше** — Beginner, Elementary и Pre-Intermediate нет.

## Структура

```
docs/rubrics/speaking/
  intermediate.yaml       # Intermediate (B2) — готово
  upper_intermediate.yaml # Upper-Intermediate (B2+) — готово
  advanced.yaml           # Advanced (C1) — готово
```

## Шкала

Одинаковая для всех уровней Yappi. По каждой категории: **5 · 10 · 15 · 20 · 25**

| Балл | Уровень |
|------|---------|
| 25 | Отлично |
| 20 | Очень хорошо |
| 15 | Хорошо |
| 10 | Удовлетворительно |
| 5 | Неудовлетворительно |

**Категории:** плавность · грамматика · связность · новый материал модуля.

## Как методист обновляет

1. Правит `.yaml` нужного уровня (или передаёт правки — вносит dev).
2. На 2–3 реальных транскриптах проверяют отчёт на дашборде.
3. При необходимости — `python scripts/reprocess_lesson.py <bot_id>`.

## Подключение к коду

- `services/rubric_service.py` — загрузка YAML и форматирование блока для промпта.
- `services/student_profiles.py` — поле `course_level` (например `upper_intermediate`).
- `services/claude_service.py` — рубрика уровня студента добавляется во второй cached system block.
