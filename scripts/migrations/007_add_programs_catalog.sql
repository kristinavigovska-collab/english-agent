-- Programs catalog, subscription plans, and student enrollment (Phase 2b backend).
-- Seeds match PROGRAM_CATALOG + PROGRAM_LEARNING_PLANS in static/dashboard.js.
-- Run: python scripts/run_supabase_migration.py 007_add_programs_catalog.sql

CREATE TABLE IF NOT EXISTS programs (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('general', 'business', 'special')),
    level_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    classes_count INTEGER NOT NULL,
    weeks_count INTEGER NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]',
    base_category TEXT CHECK (base_category IS NULL OR base_category IN ('general', 'business')),
    base_level_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_programs_category_level
    ON programs (category, level_id);

CREATE TABLE IF NOT EXISTS program_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    card_title TEXT NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    price_note TEXT,
    per_class_note TEXT,
    live_classes_per_month INTEGER NOT NULL DEFAULT 0,
    features JSONB NOT NULL DEFAULT '[]',
    cta_label TEXT NOT NULL DEFAULT 'Subscribe',
    cta_variant TEXT NOT NULL DEFAULT 'dark',
    accent TEXT,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    badge TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_enrollments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
    program_id TEXT REFERENCES programs(id) ON DELETE RESTRICT NOT NULL,
    plan_id TEXT REFERENCES program_plans(id) ON DELETE RESTRICT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'trial', 'paused', 'cancelled', 'expired')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_enrollments_student
    ON student_enrollments (student_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_enrollments_one_active
    ON student_enrollments (student_id)
    WHERE status IN ('active', 'trial');

-- Subscription tiers (global; same for all programs)
INSERT INTO program_plans (
    id, name, card_title, price_cents, price_note, per_class_note,
    live_classes_per_month, features, cta_label, cta_variant, accent,
    is_featured, badge, sort_order
) VALUES
(
    'free_trial', 'FREE TRIAL', 'Try it free', 0, 'no card needed', NULL, 1,
    '[
        {"text": "1 live class included", "ok": true},
        {"text": "7 days full access", "ok": true},
        {"text": "AI error analysis", "ok": true},
        {"text": "No auto-charge", "ok": true}
    ]'::jsonb,
    'Start free →', 'free', 'free', FALSE, NULL, 1
),
(
    'solo', 'SOLO', 'Self-study', 2000, 'per month', NULL, 0,
    '[
        {"text": "yBook + program access", "ok": true},
        {"text": "AI Tutor for self-study", "ok": true},
        {"text": "Goal & progress dashboard", "ok": true},
        {"text": "No live classes", "ok": false}
    ]'::jsonb,
    'Subscribe', 'dark', NULL, FALSE, NULL, 2
),
(
    'light', 'LIGHT', '4 classes / mo', 8800, 'per month', '€17 per class', 4,
    '[
        {"text": "Everything in Solo", "ok": true},
        {"text": "4 × 30 min live classes", "ok": true},
        {"text": "AI analysis after each class", "ok": true},
        {"text": "1 class per week", "ok": true}
    ]'::jsonb,
    'Subscribe', 'dark', NULL, FALSE, NULL, 3
),
(
    'standard', 'STANDARD', '8 classes / mo', 14000, 'per month', '€15 per class', 8,
    '[
        {"text": "Everything in Light", "ok": true},
        {"text": "8 × 30 min live classes", "ok": true},
        {"text": "2 classes per week", "ok": true},
        {"text": "Goal velocity forecast", "ok": true}
    ]'::jsonb,
    'Subscribe', 'accent', NULL, TRUE, 'Most popular', 4
),
(
    'intensive', 'INTENSIVE', '16 classes / mo', 23600, 'per month', '€13.5 per class', 16,
    '[
        {"text": "Everything in Standard", "ok": true},
        {"text": "16 × 30 min live classes", "ok": true},
        {"text": "4 classes per week", "ok": true},
        {"text": "Priority tutor matching", "ok": true}
    ]'::jsonb,
    'Subscribe', 'dark', NULL, FALSE, NULL, 5
)
ON CONFLICT (id) DO NOTHING;

-- Program catalog (ids must match dashboard.js PROGRAM_CATALOG)
INSERT INTO programs (
    id, category, level_id, title, description,
    classes_count, weeks_count, tags, base_category, base_level_id, sort_order
) VALUES
(
    'general-beginner', 'general', 'beginner',
    'General English — Beginner',
    'Старт с нуля: алфавит, базовые фразы, понимание простых вопросов и ответов в быту.',
    24, 12, '["Алфавит", "Быт", "Listening"]'::jsonb, NULL, NULL, 10
),
(
    'general-elementary', 'general', 'elementary',
    'General English — Elementary',
    'Расширяем словарь и говорим о себе, семье, работе и повседневных ситуациях.',
    26, 13, '["Speaking", "Present Simple", "Travel"]'::jsonb, NULL, NULL, 20
),
(
    'general-pre-intermediate', 'general', 'pre_intermediate',
    'General English — Pre-Intermediate',
    'Переходный уровень: увереннее в прошедшем времени, модальных глаголах и диалогах.',
    26, 13, '["Past tenses", "Modal verbs", "Dialogues"]'::jsonb, NULL, NULL, 30
),
(
    'general-intermediate', 'general', 'intermediate',
    'General English — Intermediate',
    'Свободнее обсуждаете новости, планы и мнения; закрепляете грамматику среднего уровня.',
    26, 13, '["Opinions", "Conditionals", "Fluency"]'::jsonb, NULL, NULL, 40
),
(
    'general-upper-intermediate', 'general', 'upper_intermediate',
    'General English — Upper-Intermediate',
    'Сложные темы, идиомы и точность речи — подготовка к продвинутому уровню и экзаменам.',
    28, 14, '["Idioms", "Accuracy", "Debates"]'::jsonb, NULL, NULL, 50
),
(
    'general-advanced', 'general', 'advanced',
    'General English — Advanced',
    'Почти носительский уровень: нюансы, стили речи, профессиональные и академические контексты.',
    30, 15, '["Nuances", "Academic", "Professional"]'::jsonb, NULL, NULL, 60
),
(
    'business-intermediate', 'business', 'intermediate',
    'Business English — Intermediate',
    'Письма, звонки и встречи: базовый деловой английский для офиса и первых переговоров.',
    24, 12, '["Emails", "Meetings", "Office"]'::jsonb, NULL, NULL, 70
),
(
    'business-upper-intermediate', 'business', 'upper_intermediate',
    'Business English — Upper-Intermediate',
    'Презентации, отчёты и переговоры с партнёрами — уверенная коммуникация в бизнесе.',
    26, 13, '["Presentations", "Negotiations", "Reports"]'::jsonb, NULL, NULL, 80
),
(
    'business-advanced', 'business', 'advanced',
    'Business English — Advanced',
    'Стратегические дискуссии, лидерство и сложные кейсы для руководителей и экспертов.',
    28, 14, '["Leadership", "Strategy", "Executive"]'::jsonb, NULL, NULL, 90
),
(
    'special-interview', 'special', 'upper_intermediate',
    'Interview Preparation',
    'Собеседования на английском: self-pitch, ответы на типовые вопросы, mock interview.',
    12, 6, '["CV", "HR questions", "Mock interview"]'::jsonb, 'general', 'upper_intermediate', 100
),
(
    'special-ielts', 'special', 'upper_intermediate',
    'IELTS Preparation',
    'Структура экзамена, стратегии по секциям и интенсивная практика под целевой балл.',
    16, 8, '["Reading", "Writing", "Speaking"]'::jsonb, 'general', 'upper_intermediate', 110
),
(
    'special-negotiations', 'special', 'upper_intermediate',
    'Negotiations in English',
    'Тактики переговоров, убеждение и работа с возражениями в международной среде.',
    10, 5, '["Persuasion", "Deals", "Objections"]'::jsonb, 'business', 'upper_intermediate', 120
),
(
    'special-presentations', 'special', 'intermediate',
    'Presentation Skills',
    'Структура выступления, слайды, Q&A и уверенная подача материала на английском.',
    8, 4, '["Slides", "Public speaking", "Q&A"]'::jsonb, 'business', 'intermediate', 130
),
(
    'special-travel', 'special', 'elementary',
    'Travel & Culture',
    'Поездки, аэропорт, отель и культурные ситуации — практичный английский для путешествий.',
    8, 4, '["Travel", "Culture", "Small talk"]'::jsonb, 'general', 'elementary', 140
),
(
    'special-customer-support', 'special', 'intermediate',
    'Customer Support English',
    'Работа с клиентами, эскалации и empathy-фразы для support и success-команд.',
    10, 5, '["Support", "Clients", "Empathy"]'::jsonb, 'business', 'intermediate', 150
),
(
    'special-management', 'special', 'advanced',
    'Management Communication',
    'One-on-ones, feedback, делегирование и сложные разговоры с командой на английском.',
    12, 6, '["Feedback", "1:1", "Team lead"]'::jsonb, 'business', 'advanced', 160
)
ON CONFLICT (id) DO NOTHING;
