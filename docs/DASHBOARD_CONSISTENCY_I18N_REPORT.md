# Dashboard consistency / i18n / AI Report v2 — report

Date: 2026-07-20

## Spec vs code (audit notes)

| Prompt claim | Actual finding |
|---|---|
| Class 3 meta shows Travel & Past Tenses | Current demo used `report.lesson_topic` (e.g. Active listening) while curriculum title could differ (Fluency / tag-cycled titles). Root cause: meta read `lesson_topic`, sidebar read curriculum `title`. |
| Progress 2/10 vs module 3/4 vs Report badges | Header counted `item.completed` (lesson+practice); module counted `lessonCompleted`; badges needed `lessonReportId`. |
| Duplicate Persuasion in Module 1 | `special-negotiations.lesson_titles` already unique. Dupes came from tag-cycling on programs without `lesson_titles` (e.g. general-intermediate Opinions×N). Demo was on general-intermediate. |

## Done

1. **Lesson sync** — `getLessonDisplayTitle` / `getLessonDisplayDate` use curriculum item for `class_num`; report heading/meta align with class card.
2. **Single progress source** — header, module `N/M`, and stage completion use `lessonCompleted`.
3. **Unique titles** — demo curriculum rebuilt for `special-negotiations` (10 unique titles); preview enrollment defaults to that program.
4. **CEFR out of participant UI** — sidebar level chip hidden; vocab CEFR badge/caption/live level/timeline hidden; summary text no longer mentions CEFR. Data fields kept.
5. **i18n** — `static/i18n.js`, `locales/ru.json` (+ empty en/pt/pl), `t()`, dates via `Intl` through DashboardI18n. Lesson/module titles stay as learning content.
6. **Notify slot** — Free/Upgrade subscription widget replaced with module-complete notice + Book CTA; hidden when no completed module. TODO left for personalized offers.
7. **AI Report v2 order** — header (+ goal TODO) → Движение к цели (empty) → Следующий шаг → language diagnostics → Что попрактиковать / plan / drills.

## Tests

- `node --check` on `dashboard.js`, `i18n.js`, `curriculum-stages.js` — OK
- `pytest tests/test_goal_plan_service.py tests/test_error_pattern_service.py` — 5 passed
- Enrollment API tests fail in this environment with httpx ProxyError 403 to Supabase (env/network), not caused by these UI changes

## Follow-ups

- Full sweep of remaining hard-coded UI strings in Programs/Analytics/goal modal into `t()` (Home/nav/report/curriculum covered first).
- When programs generator exposes lesson goals / criterion_id, fill `#lesson-report-goal` and «Движение к цели».
- Vocab `/10` score field does not exist yet — badge hidden until a numeric score is available.
- Do not change shared program-generator contracts from this repo unilaterally.
