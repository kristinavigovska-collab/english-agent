# Programs & subscriptions

Agent reference for the **Programs** track (catalog → plan → enrollment → curriculum). Lesson pipeline (`Recall → reports`) is separate — see `docs/ARCHITECTURE.md`.

Last updated: 2026-06-23

## Product model

| Concept | Meaning |
|---------|---------|
| **Program** | A course track (e.g. General English — Intermediate). Fixed number of **Classes** (`classes` × 30 min live + practice block). |
| **Learning plan** | Subscription tier (EUR/month): how many live classes per month + platform access. Same 5 tiers for every program. |
| **Enrollment** | Student is on one program + one plan at a time. Drives sidebar curriculum and (later) lesson attribution. |
| **Class** | One unit in the curriculum list (sidebar «Программа обучения»). Not the same as a **live lesson** row in `lessons` — a Class may span practice + one Meet. |

**Lesson format (product copy):** 30 min practice (yBook + AI) + 30 min live micro class. Shown on program detail page.

## Two tracks (do not conflate)

```
Track A — Lessons (production)          Track B — Programs (UI → DB)
─────────────────────────────          ───────────────────────────────
Recall webhook → lessons/reports       PROGRAM_CATALOG → programs table
student email from calendar guest      student_enrollments (P1)
lessons.lesson_topic                   curriculum_units (P2, optional)
                                       lessons.program_id (P2, optional)
```

**Agent rule:** `localStorage.enrolled_program_id` and `PROGRAM_CATALOG` in JS are **not** DB truth until the dashboard loads enrollment from the API.

## StudentLearningContext (ADR-001)

Единый объект дашборда: `static/student-learning-context.js` → `EnglishAgentSLC.build()`.

| Поле | Источник правды |
|------|-----------------|
| `enrollment` | `EnrollmentState` (localStorage) — только после явного онбординга |
| `curriculum.classes` | `program.classes` (число Class), **не** `goal.target_duration_weeks` |
| Goal / plan UI | `goal` + `studyPlan` с сервера |
| `computed.goal_eta_date` | Темп program plan (`plan_tier` → Class/нед) + прогресс curriculum |

Онбординг: `ProgramOnboarding` modal — шаг 1 программа, шаг 2 уровень → `EnrollmentState.enroll({ student_confirmed: true })`. Без автоматических рекомендаций.

Сборка: `rebuildStudentLearningContext()` в `dashboard.js` после загрузки reports/goal/enrollment.

## UI today (`static/dashboard.js`)

| Constant | Role |
|----------|------|
| `PROGRAM_CATALOG` | 16 placeholder programs (General ×6, Business ×3, Special ×7) |
| `PROGRAM_LEARNING_PLANS` | 5 EUR tiers: `free_trial`, `solo`, `light`, `standard`, `intensive` |
| `PROGRAM_LEVELS` | Level filter labels + CEFR hint |
| `PROGRAM_CATEGORY_LABELS` | `general` \| `business` \| `special` |
| `PLACEHOLDER_CEFR_CURRICULUM` | Sidebar class list by CEFR level — **not** linked to enrolled program |
| `ENROLLED_PROGRAM_KEY` | `localStorage` key `enrolled_program_id` |

### Navigation

| View | `#view-*` | Notes |
|------|-----------|-------|
| Home | `view-home` | Reports, sidebar goal/plan, curriculum placeholder |
| Programs | `view-programs` | Catalog, filters, detail + horizontal plan cards |
| Analytics | `view-analytics` | Heatmap, «Общий прогресс» — not on Home |

Nav labels in **English**; program copy mostly **Russian**.

### User flows (UI only)

1. **Browse** — category tabs + level chips → grid of `program-card`.
2. **Detail** — «Посмотреть программу» → in-page detail (not a separate route).
3. **Plan CTA** — `goToProgramCheckout(planId, programId)` → `/checkout?plan={id}&program={program_id}` (**404**, no backend).
4. **Enrollment display** — if `enrolled_program_id` matches, card shown as current in catalog grid. No server write.

### Special programs (`base` field)

Special programs reference a **base** General/Business level for curriculum anchoring:

| Program id | `base` |
|------------|--------|
| `special-interview`, `special-ielts` | general / upper_intermediate |
| `special-negotiations` | business / upper_intermediate |
| `special-presentations`, `special-customer-support` | business / intermediate |
| `special-travel` | general / elementary |
| `special-management` | business / advanced |

Stored in DB as `base_category` + `base_level_id` (nullable).

## Learning plans (EUR)

| id | Name | Price | Live classes / month | Notes |
|----|------|-------|----------------------|-------|
| `free_trial` | FREE TRIAL | €0 | 1 (trial) | 7 days, no card |
| `solo` | SOLO | €20/mo | 0 | Practice + AI only |
| `light` | LIGHT | €88/mo | 4 | ~1/week, €17/class |
| `standard` | STANDARD | €140/mo | 8 | Featured; ~2/week, €15/class |
| `intensive` | INTENSIVE | €236/mo | 16 | ~4/week, €13.5/class |

Plans are **global** (not per-program rows in product logic). `program_plans` table holds catalog metadata; enrollment picks `program_id` + `plan_id`.

## Database (migration `007`)

**File:** `scripts/migrations/007_add_programs_catalog.sql`

| Table | Purpose |
|-------|---------|
| `programs` | Catalog; `id` TEXT slug matches `PROGRAM_CATALOG[].id` |
| `program_plans` | Five subscription tiers; `id` matches `PROGRAM_LEARNING_PLANS[].id` |
| `student_enrollments` | One active row per student (partial unique index); FK to `students`, `programs`, `program_plans` |

**Not in 007 (later):**

| Item | Migration / work |
|------|------------------|
| `curriculum_units` | `008+` — ordered Classes per program |
| `lessons.program_id` | `008+` — webhook optional FK |
| Checkout / Stripe | App route + payment provider |
| `schools` | Multi-tenant school account |

### Apply

```bash
python scripts/run_supabase_migration.py 007_add_programs_catalog.sql
```

Verify:

```sql
SELECT count(*) FROM programs;        -- 16
SELECT count(*) FROM program_plans;   -- 5
```

## Planned API (not implemented)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/programs` | List catalog (+ optional `?category=` / `?level=`) |
| `GET` | `/api/programs/{id}` | Single program + plans (or plans global) |
| `GET` | `/api/students/{id}/enrollment` | Current enrollment or `null` |
| `POST` | `/api/students/{id}/enrollment` | Set program + plan (replaces active) |
| `DELETE` | `/api/students/{id}/enrollment` | Clear enrollment |

**Dashboard wiring (after API):**

1. On live load, fetch enrollment → set `state.enrolledProgramId` (drop `localStorage` as source of truth).
2. `GET /api/programs` replaces `PROGRAM_CATALOG` constant (or hydrate from API with JS fallback).
3. Sidebar `renderCurriculumProgram()` uses enrolled program + `curriculum_units` (when exists).

## Checkout stub

```
/checkout?plan=standard&program=general-intermediate
```

Expected future behavior: validate plan + program → Stripe Checkout Session → webhook → `student_enrollments` insert/update. **No route today.**

## Catalog seed ids (007)

**General:** `general-beginner`, `general-elementary`, `general-pre-intermediate`, `general-intermediate`, `general-upper-intermediate`, `general-advanced`

**Business:** `business-intermediate`, `business-upper-intermediate`, `business-advanced`

**Special:** `special-interview`, `special-ielts`, `special-negotiations`, `special-presentations`, `special-travel`, `special-customer-support`, `special-management`

## Related docs

- `docs/STATUS.md` — P0 lesson test, P1 programs backend checklist
- `docs/ARCHITECTURE.md` — two-track diagram, dashboard views
- `docs/MIGRATIONS.md` — apply order through `007`
- `AGENTS.md` — repo map, do-not assumptions
