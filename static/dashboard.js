(function () {
  var STUDENT_ID = window.STUDENT_ID || "";
  var isDemo =
    !STUDENT_ID ||
    STUDENT_ID === "__STUDENT_ID__" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      STUDENT_ID
    );

  var CEFR_CAPTION = "Уровень CEFR (международная шкала A1–C2)";

  var CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
  var HOURS_PER_CEFR_LEVEL = 190;
  var SCENARIO_COEFF = 0.5;
  var PLAN_DISCLAIMER =
    "Расчёт на основе средних нормативов CEFR (~190 ч/уровень), уточняется по мере вашего прогресса";
  var PLAN_DISCLAIMER_SHORT = "На основе нормативов CEFR";
  var DURATION_WEEKS_MIN = 1;
  var DURATION_WEEKS_MAX = 104;
  var STUCK_LESSONS_THRESHOLD = 3;
  var RESOLVED_ABSENCE_LESSONS = 2;
  var STUCK_LOAD_MULTIPLIER = 1.1;
  var STUCK_LOAD_MIN_CATEGORIES = 2;
  var SIDEBAR_WIDTH_KEY = "sidebar_width";
  var SIDEBAR_WIDTH_DEFAULT = 360;
  var SIDEBAR_WIDTH_MIN = 360;
  var SIDEBAR_WIDTH_MAX = 480;
  var SIDEBAR_WIDTH_MAX_RATIO = 0.4;
  var GOAL_PLAN_COLLAPSED_KEY = "sidebar_goal_collapsed";
  var ACTIVITY_HEATMAP_WEEKS = 16;
  var MONTH_SHORT_RU = [
    "янв",
    "фев",
    "мар",
    "апр",
    "май",
    "июн",
    "июл",
    "авг",
    "сен",
    "окт",
    "ноя",
    "дек",
  ];

  // PLACEHOLDER curriculum — replace with school program / textbook API when available.
  var PLACEHOLDER_CEFR_CURRICULUM = {
    A1: [
      "Знакомство и приветствия",
      "Числа, даты и время",
      "Present Simple: базовые глаголы",
      "Семья и описание людей",
      "Еда и заказ в кафе",
      "Мой день (рутина)",
    ],
    A2: [
      "Past Simple: правила и исключения",
      "Future: going to и will",
      "Путешествия и транспорт",
      "Покупки и деньги",
      "Здоровье и у врача",
      "Hobbies and free time",
    ],
    B1: [
      "Travel & Past Tenses",
      "Present Perfect vs Past Simple",
      "Conditionals (zero, first, second)",
      "Passive voice",
      "Reported speech",
      "Modals of deduction",
      "Relative clauses",
      "Phrasal verbs (common)",
    ],
    B2: [
      "Advanced conditionals and mixed",
      "Inversion and emphasis",
      "Discourse markers",
      "Formal vs informal register",
      "Essay structure and linking",
      "Professional meetings",
    ],
    C1: [
      "Nuance in modals and hedging",
      "Academic writing style",
      "Idioms in business context",
      "Complex nominalisation",
      "Media and critical analysis",
      "Interview preparation",
    ],
    C2: [
      "Near-native fluency refinements",
      "Stylistic variation",
      "Subtle register shifts",
      "Advanced collocations",
    ],
  };

  var INTENSITY_PRESETS = {
    once_week: {
      label: "1 раз в неделю",
      classesPerWeek: 1,
      tutorLessons: 1,
      practiceDays: 1,
    },
    few_times_week: {
      label: "2–3 раза в неделю",
      classesPerWeek: 2.5,
      tutorLessons: 3,
      practiceDays: 3,
    },
    daily: {
      label: "Каждый день",
      classesPerWeek: 7,
      tutorLessons: 7,
      practiceDays: 7,
    },
  };

  var ERROR_CATEGORY_LABELS = {
    third_person_singular: "Согласование 3-го лица ед.ч.",
    noun_plural: "Множественное число существительных",
    verb_preposition: "Предлоги после глаголов",
    tense_agreement: "Согласование времён",
    past_simple: "Past Simple",
    present_perfect: "Present Perfect / Past vs Perfect",
    conditionals: "Условные предложения",
    question_formation: "Построение вопросов",
    possessive: "Притяжательный падеж",
    articles: "Артикли (a/an/the)",
    comparatives: "Сравнительная и превосходная степень",
    gerunds_infinitives: "Gerund vs Infinitive",
    much_many: "Much vs Many / исчисляемость",
    word_order: "Порядок слов",
    fillers_coherence: "Слова-филлеры / связность речи",
    modals: "Модальные глаголы",
    other: "Прочее",
  };

  var state = {
    reports: [],
    studentName: "Студент",
    selectedId: null,
    historyBound: false,
    curriculumFilter: "all",
    curriculumFilterBound: false,
    curriculumActionsBound: false,
    curriculumStubProgress: {},
    curriculumStubPending: null,
    curriculumItems: [],
    reportClassMap: {},
    goal: {
      target_cefr_level: null,
      target_date: null,
      goal_label: null,
      goal_set_date: null,
      goal_type: null,
      target_duration_weeks: null,
      scenario_description: null,
      tutor_lessons_per_week: 2,
      tutor_lesson_minutes: 60,
      practice_days_per_week: 6,
      study_intensity_preset: null,
    },
    studyPlan: null,
    progressTracker: null,
    errorTracking: null,
    goalModalBound: false,
    intensityPickerBound: false,
    studyPlanCollapseBound: false,
    goalPlanCollapsed: false,
    goalPlanCollapseBound: false,
    activityPopoverBound: false,
    activityPopoverDate: null,
  };

  var DEMO_GOAL = {
    goal_type: "scenario_based",
    target_cefr_level: "C1",
    target_duration_weeks: 26,
    target_date: "2026-12-01",
    goal_label: "собеседование на позицию менеджера",
    scenario_description: "собеседование на позицию менеджера",
    goal_set_date: "2026-04-14",
    goal_start_cefr_level: "A1",
    tutor_lessons_per_week: 2,
    tutor_lesson_minutes: 60,
    practice_days_per_week: 6,
    study_intensity_preset: null,
  };

  var DEMO_REPORTS = [
    {
      id: "demo-7",
      lesson_date: "2026-05-28T14:00:00Z",
      created_at: "2026-05-28T14:00:00Z",
      grammar_errors: [
        {
          error: "She don't like spicy food",
          correction: "She doesn't like spicy food",
          explanation:
            "В Present Simple с she/he/it вспомогательный глагол — doesn't, а основной глагол без окончания -s.",
          error_category: "third_person_singular",
        },
        {
          error: "I am living here since 2020",
          correction: "I have lived here since 2020",
          explanation:
            "Since + точка в прошлом требует Present Perfect — действие началось тогда и продолжается. Present Continuous (am living) с since не сочетается.",
          error_category: "present_perfect",
        },
        {
          error: "I have went to Paris last year",
          correction: "I went to Paris last year",
          explanation:
            "Маркер «last year» указывает на завершённое действие в прошлом — нужен Past Simple (went). Present Perfect (have + V3) с конкретным прошлым временем не используется.",
          error_category: "past_simple",
        },
        {
          error: "More better than before",
          correction: "Much better than before",
          explanation:
            "У коротких прилагательных сравнительная степень — суффикс -er (better), без more. Much усиливает сравнение: much better.",
          error_category: "comparatives",
        },
      ],
      vocabulary_level: "B1",
      fluency_score: 8,
      lesson_topic: "Travel & Past Tenses",
      weak_topics: ["Past Simple vs Present Perfect", "Comparatives", "Ed/-ing adjectives"],
      recommendations: ["Gap-fill: 15 предложений на времена", "Role-play: booking a hotel", "Shadowing: travel podcast"],
    },
    {
      id: "demo-6",
      lesson_date: "2026-05-19T14:00:00Z",
      created_at: "2026-05-19T14:00:00Z",
      grammar_errors: [
        {
          error: "If I will have time, I will call you",
          correction: "If I have time, I will call you",
          explanation:
            "В First Conditional (реальное условие) после if используется Present Simple, а не will. Will стоит только в главной части предложения.",
          error_category: "conditionals",
        },
        {
          error: "He suggested to go earlier",
          correction: "He suggested going earlier",
          explanation:
            "После suggest нужен gerund (-ing), а не infinitive с to. Правильно: suggest doing something.",
          error_category: "gerunds_infinitives",
        },
        {
          error: "She don't want to wait",
          correction: "She doesn't want to wait",
          explanation:
            "В Present Simple с she/he/it — doesn't + базовая форма глагола.",
          error_category: "third_person_singular",
        },
      ],
      vocabulary_level: "B1",
      fluency_score: 7.5,
      weak_topics: ["Conditionals", "Gerunds after suggest"],
      recommendations: ["Упражнения на 1st conditional", "Пересказ диалога из подкаста"],
    },
    {
      id: "demo-5",
      lesson_date: "2026-05-12T14:00:00Z",
      created_at: "2026-05-12T14:00:00Z",
      grammar_errors: [
        {
          error: "I didn't went there",
          correction: "I didn't go there",
          explanation:
            "После didn't (Past Simple) идёт базовая форма глагола (go), а не Past Simple (went).",
          error_category: "past_simple",
        },
        {
          error: "Much people were waiting",
          correction: "Many people were waiting",
          explanation:
            "Much используется с неисчисляемыми существительными. People — исчисляемое, поэтому many.",
          error_category: "much_many",
        },
        {
          error: "She is teacher",
          correction: "She is a teacher",
          explanation:
            "Перед профессией в единственном числе нужен неопределённый артикль a/an: a teacher.",
          error_category: "articles",
        },
        {
          error: "My brother work in London",
          correction: "My brother works in London",
          explanation:
            "В Present Simple с he/she/it глагол получает окончание -s: works.",
          error_category: "third_person_singular",
        },
      ],
      vocabulary_level: "A2",
      fluency_score: 7,
      weak_topics: ["Articles", "Much vs many", "Past Simple"],
      recommendations: ["Статьи a/an/the — 10 предложений", "Повторить irregular verbs"],
    },
    {
      id: "demo-4",
      lesson_date: "2026-05-05T14:00:00Z",
      created_at: "2026-05-05T14:00:00Z",
      grammar_errors: [
        {
          error: "I look forward to meet you",
          correction: "I look forward to meeting you",
          explanation:
            "Look forward to — устойчивое сочетание, после to здесь идёт gerund (-ing), а не infinitive.",
        },
      ],
      vocabulary_level: "A2",
      fluency_score: 6.5,
      weak_topics: ["Gerunds after prepositions"],
      recommendations: ["Составить 5 писем с look forward to"],
    },
    {
      id: "demo-3",
      lesson_date: "2026-04-28T14:00:00Z",
      created_at: "2026-04-28T14:00:00Z",
      grammar_errors: [
        {
          error: "He don't know the answer",
          correction: "He doesn't know the answer",
          explanation:
            "В Present Simple с he/she/it вспомогательный — doesn't + базовая форма глагола.",
        },
        {
          error: "I am agree with you",
          correction: "I agree with you",
          explanation:
            "Agree — глагол состояния (stative verb), не используется с am/is/are. Правильно: I agree.",
        },
      ],
      vocabulary_level: "A2",
      fluency_score: 6,
      weak_topics: ["Present Simple", "State verbs"],
      recommendations: ["Диалог: согласие и несогласие"],
    },
    {
      id: "demo-2",
      lesson_date: "2026-04-21T14:00:00Z",
      created_at: "2026-04-21T14:00:00Z",
      grammar_errors: [
        {
          error: "I have 25 years old",
          correction: "I am 25 years old",
          explanation:
            "Возраст выражается через to be: I am + число + years old. Have здесь не используется.",
        },
        {
          error: "She is more tall than me",
          correction: "She is taller than me",
          explanation:
            "У односложных прилагательных сравнительная степень — суффикс -er (taller), без more.",
        },
      ],
      vocabulary_level: "A2",
      fluency_score: 5.5,
      weak_topics: ["To be", "Comparatives"],
      recommendations: ["Описать семью — 10 предложений"],
    },
    {
      id: "demo-1",
      lesson_date: "2026-04-14T14:00:00Z",
      created_at: "2026-04-14T14:00:00Z",
      grammar_errors: [
        {
          error: "I go to school yesterday",
          correction: "I went to school yesterday",
          explanation:
            "Yesterday — маркер Past Simple. Нужна форма went, а не go (Present Simple).",
        },
        {
          error: "He can to swim",
          correction: "He can swim",
          explanation:
            "После модального глагола can идёт базовая форма без to: can swim.",
        },
        {
          error: "She is speak English",
          correction: "She speaks English",
          explanation:
            "Present Simple: с she/he/it глагол получает -s (speaks). Is используется только для Continuous или пассива.",
        },
      ],
      vocabulary_level: "A1",
      fluency_score: 5,
      weak_topics: ["Past Simple", "Modals", "Present Simple"],
      recommendations: ["Базовые глаголы — карточки", "Present Simple — 10 фраз о себе"],
    },
  ];

  var NAV_VIEW_KEY = "app_nav_view";
  var NAV_COLLAPSED_KEY = "app_nav_collapsed";

  initSidebarResize();
  initGrammarToggles();
  initGoalModal();
  initGoalPlanCollapse();
  initStudyPlanCollapse();
  initActivityHeatmapPopover();
  initAppNav();

  document.querySelectorAll("#view-home .tab, #view-analytics .analytics-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var root = tab.closest(".app-view");
      activateTab(tab.dataset.tab, root);
    });
  });

  initLessonNavigation();
  initCurriculumFilters();
  initCurriculumActions();

  if (isDemo) {
    var loadingDemo = document.getElementById("dash-loading");
    if (loadingDemo) loadingDemo.hidden = true;
    state.reports = sortReports(DEMO_REPORTS);
    refreshErrorTracking();
    state.studentName = "Кристина Виговская";
    state.goal = DEMO_GOAL;
    state.studyPlan = computeStudyPlanClient(DEMO_GOAL, state.reports, state.errorTracking);
    state.progressTracker = buildDemoProgressTracker(DEMO_GOAL, state.reports);
    renderStudentOverview();
    if (state.reports.length) {
      selectLesson(state.reports[0].id, { switchTab: false });
    }
    return;
  }

  var loadingEl = document.getElementById("dash-loading");
  var errorEl = document.getElementById("dash-error");
  var mainEl = document.querySelector(".main");

  if (loadingEl) loadingEl.hidden = false;
  if (mainEl) mainEl.style.visibility = "hidden";

  fetch("/api/students/" + encodeURIComponent(STUDENT_ID) + "/reports")
    .then(function (res) {
      if (!res.ok) {
        return res.json().then(function (body) {
          throw new Error(body.detail || res.statusText);
        });
      }
      return res.json();
    })
    .then(function (data) {
      document.querySelectorAll(".demo-only").forEach(function (el) {
        el.hidden = true;
      });
      state.reports = sortReports(data.reports || []);
      state.studentName = data.student_name || data.student_email || "Студент";
      state.goal = {
        target_cefr_level: data.target_cefr_level || null,
        target_date: data.target_date || null,
        goal_label: data.goal_label || null,
        goal_set_date: data.goal_set_date || null,
        goal_type: data.goal_type || null,
        target_duration_weeks: data.target_duration_weeks || null,
        scenario_description: data.scenario_description || null,
        tutor_lessons_per_week: data.tutor_lessons_per_week || 2,
        tutor_lesson_minutes: data.tutor_lesson_minutes || 60,
        practice_days_per_week: data.practice_days_per_week || 6,
        study_intensity_preset: data.study_intensity_preset || null,
      };
      state.studyPlan = data.study_plan || null;
      state.progressTracker = data.progress_tracker || null;
      state.errorTracking = data.error_tracking || null;
      renderStudentOverview();
      if (!state.reports.length) {
        setHtml("grammar-list-current", emptyMsg("Пока нет отчётов по урокам."));
        setHtml("grammar-list-detailed", emptyMsg("Пока нет отчётов по урокам."));
        return;
      }
      selectLesson(state.reports[0].id, { switchTab: false });
      renderChart(state.reports.slice().reverse());
    })
    .catch(function (err) {
      if (errorEl) {
        errorEl.textContent =
          "Не удалось загрузить отчёты: " + (err.message || "ошибка сети");
        errorEl.hidden = false;
      }
    })
    .finally(function () {
      if (loadingEl) loadingEl.hidden = true;
      if (mainEl) mainEl.style.visibility = "";
    });

  function initAppNav() {
    var shell = document.querySelector(".app-shell");
    var toggle = document.getElementById("app-nav-toggle");
    if (toggle && shell) {
      toggle.addEventListener("click", function () {
        setAppNavCollapsed(!shell.classList.contains("is-nav-collapsed"));
      });
    }

    var collapsed = false;
    try {
      collapsed = localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
    } catch (e) {
      collapsed = false;
    }
    setAppNavCollapsed(collapsed, { persist: false });

    document.querySelectorAll(".app-nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setAppNavView(btn.dataset.navView);
      });
    });

    var saved = "home";
    try {
      saved = localStorage.getItem(NAV_VIEW_KEY) || "home";
    } catch (e) {
      saved = "home";
    }
    setAppNavView(saved);
  }

  function setAppNavCollapsed(collapsed, options) {
    options = options || {};
    var shell = document.querySelector(".app-shell");
    var toggle = document.getElementById("app-nav-toggle");
    if (!shell) return;

    shell.classList.toggle("is-nav-collapsed", !!collapsed);

    if (toggle) {
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.setAttribute(
        "aria-label",
        collapsed ? "Развернуть меню" : "Свернуть меню"
      );
    }

    if (options.persist !== false) {
      try {
        localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
      } catch (e) {
        /* ignore */
      }
    }
  }

  function setAppNavView(view) {
    view = view === "analytics" ? "analytics" : "home";
    document.querySelectorAll(".app-nav-item").forEach(function (btn) {
      var active = btn.dataset.navView === view;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-current", active ? "page" : "false");
    });

    var homeView = document.getElementById("view-home");
    var analyticsView = document.getElementById("view-analytics");
    if (homeView) homeView.hidden = view !== "home";
    if (analyticsView) analyticsView.hidden = view !== "analytics";

    try {
      localStorage.setItem(NAV_VIEW_KEY, view);
    } catch (e) {
      /* ignore */
    }
  }

  function initLessonNavigation() {
    if (state.historyBound) return;
    state.historyBound = true;

    var latestBtn = document.getElementById("btn-lesson-latest");
    if (latestBtn) {
      latestBtn.addEventListener("click", function () {
        var latest = getLatestReport();
        if (latest) selectLesson(latest.id);
      });
    }
  }

  function initCurriculumFilters() {
    if (state.curriculumFilterBound) return;
    state.curriculumFilterBound = true;

    document.querySelectorAll(".curriculum-filter-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.curriculumFilter = btn.dataset.filter || "all";
        document.querySelectorAll(".curriculum-filter-btn").forEach(function (item) {
          var active = item === btn;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-selected", active ? "true" : "false");
        });
        renderCurriculumProgram();
      });
    });
  }

  function activateTab(target, root) {
    root = root || document.getElementById("view-home");
    if (!root) return;
    var tabSelector = root.id === "view-analytics" ? ".analytics-tab" : ".tab";
    root.querySelectorAll(tabSelector).forEach(function (t) {
      var active = t.dataset.tab === target;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    root.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === "panel-" + target);
    });
  }

  function sortReports(reports) {
    return reports.slice().sort(function (a, b) {
      var da = new Date(a.lesson_date || a.created_at || 0);
      var db = new Date(b.lesson_date || b.created_at || 0);
      return db - da;
    });
  }

  function getLatestReport() {
    return state.reports[0] || null;
  }

  function getSelectedReport() {
    if (!state.selectedId) return getLatestReport();
    return (
      state.reports.find(function (r) {
        return r.id === state.selectedId;
      }) || getLatestReport()
    );
  }

  function selectLesson(reportId, options) {
    options = options || {};
    var report = state.reports.find(function (r) {
      return r.id === reportId;
    });
    if (!report) return;

    state.selectedId = reportId;
    var latest = getLatestReport();
    var isLatest = latest && latest.id === reportId;

    renderLessonReport(report, isLatest);
    updateLessonContextBar(report, isLatest);
    updateCurriculumReportLinks();

    if (options.switchTab !== false) {
      activateTab("current", document.getElementById("view-home"));
    }
  }

  function renderStudentOverview() {
    var latest = getLatestReport();

    setText("dash-name", state.studentName);
    setText("dash-avatar", initials(state.studentName));
    setText("dash-stat-lessons", String(state.reports.length));
    setText(
      "dash-stat-avg",
      state.reports.length
        ? formatScore(
            average(
              state.reports.map(function (r) {
                return r.fluency_score;
              })
            )
          ) + " / 10"
        : "—"
    );
    setText("dash-cefr-current", latest ? latest.vocabulary_level || "—" : "—");
    setText("dash-stat-cefr", latest ? latest.vocabulary_level || "—" : "—");
    renderStudentGoal();
    renderStudyPlan();
    renderCurriculumProgram();
    renderActivity();
    renderAnalyticsGoalPlan();
  }

  function hasGoal() {
    return !!(
      state.goal &&
      state.goal.target_cefr_level &&
      (state.goal.target_duration_weeks || state.goal.target_date)
    );
  }

  function cefrIndex(level) {
    if (!level) return -1;
    return CEFR_LEVELS.indexOf(String(level).toUpperCase());
  }

  function cefrScore(level, fluency) {
    var idx = cefrIndex(level);
    if (idx < 0) return null;
    if (fluency == null) return idx + 0.25;
    return idx + (Math.min(Math.max(Number(fluency), 0), 10) / 10) * 0.5;
  }

  function categoryLabel(catId) {
    return ERROR_CATEGORY_LABELS[catId] || ERROR_CATEGORY_LABELS.other;
  }

  function inferErrorCategory(item) {
    if (item.error_category) return item.error_category;
    var blob = [item.error, item.correction, item.explanation].join(" ").toLowerCase();
    if (/3-го лица|third person|doesn't|don't like|he go|she go/.test(blob)) {
      return "third_person_singular";
    }
    if (/past simple|didn't|last year|yesterday/.test(blob)) return "past_simple";
    if (/present perfect|since |for /.test(blob)) return "present_perfect";
    if (/артикл|article| a | an /.test(blob)) return "articles";
    if (/comparative|better|more better/.test(blob)) return "comparatives";
    if (/conditional|if i will/.test(blob)) return "conditionals";
    if (/gerund|infinitive|suggest|look forward/.test(blob)) return "gerunds_infinitives";
    if (/much vs many|many people|much people/.test(blob)) return "much_many";
    return "other";
  }

  function categoriesInReport(report) {
    var counts = {};
    (report.grammar_errors || []).forEach(function (item) {
      var cat = inferErrorCategory(item);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }

  function reportChronoDate(report) {
    return parseIsoDate(report.lesson_date || report.created_at);
  }

  function maxConsecutiveStreak(flags) {
    var best = 0;
    var current = 0;
    flags.forEach(function (flag) {
      if (flag) {
        current += 1;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    });
    return best;
  }

  function consecutiveAtEnd(flags) {
    var count = 0;
    for (var i = flags.length - 1; i >= 0; i -= 1) {
      if (flags[i]) count += 1;
      else break;
    }
    return count;
  }

  function absentFromLastN(flags, n) {
    if (flags.length < n) return false;
    for (var i = flags.length - n; i < flags.length; i += 1) {
      if (flags[i]) return false;
    }
    return true;
  }

  function classifyPatternStatus(flags, consecutive, maxStreak, firstIdx, numLessons) {
    if (!numLessons || !flags.some(Boolean)) return "inactive";
    var wasStuck = maxStreak >= STUCK_LESSONS_THRESHOLD;
    var isNew = firstIdx === numLessons - 1 && flags[numLessons - 1];
    if (consecutive >= STUCK_LESSONS_THRESHOLD) return "stuck";
    if (isNew) return "new";
    if (wasStuck && consecutive === 0 && absentFromLastN(flags, RESOLVED_ABSENCE_LESSONS)) {
      return "resolved";
    }
    if (flags[numLessons - 1] || consecutive > 0) return "recurring";
    return "inactive";
  }

  function buildErrorTracking(reports) {
    var sorted = reports.slice().sort(function (a, b) {
      return (reportChronoDate(a) || 0) - (reportChronoDate(b) || 0);
    });
    if (!sorted.length) {
      return { patterns: [], stuck_patterns: [], new_patterns: [], stuck_topics: [] };
    }

    var categoryMap = {};
    sorted.forEach(function (report) {
      var counts = categoriesInReport(report);
      Object.keys(counts).forEach(function (cat) {
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push({
          lesson_id: report.lesson_id || report.id,
          report_id: report.id,
          date: isoDateOnly(reportChronoDate(report) || new Date()),
          count_in_lesson: counts[cat],
        });
      });
    });

    var patterns = Object.keys(categoryMap).map(function (cat) {
      var occs = categoryMap[cat];
      var flags = sorted.map(function (r) {
        return !!categoriesInReport(r)[cat];
      });
      var consecutive = consecutiveAtEnd(flags);
      var maxStreak = maxConsecutiveStreak(flags);
      var firstIdx = flags.indexOf(true);
      var status = classifyPatternStatus(
        flags,
        consecutive,
        maxStreak,
        firstIdx,
        sorted.length
      );
      return {
        error_category: cat,
        label: categoryLabel(cat),
        occurrences: occs,
        total_occurrences: occs.reduce(function (sum, o) {
          return sum + o.count_in_lesson;
        }, 0),
        consecutive_lessons_count: consecutive,
        max_consecutive_lessons: maxStreak,
        status: status,
      };
    });

    var rank = { stuck: 0, new: 1, recurring: 2, resolved: 3, inactive: 4 };
    patterns.sort(function (a, b) {
      return (
        (rank[a.status] || 9) - (rank[b.status] || 9) ||
        b.consecutive_lessons_count - a.consecutive_lessons_count ||
        b.total_occurrences - a.total_occurrences
      );
    });

    var stuck = patterns.filter(function (p) {
      return p.status === "stuck";
    });
    var fresh = patterns.filter(function (p) {
      return p.status === "new";
    });
    var stuckTopics = stuck.slice(0, 3).map(function (p) {
      var n = p.consecutive_lessons_count;
      return {
        error_category: p.error_category,
        label: p.label,
        consecutive_lessons_count: n,
        message:
          p.label +
          " — повторяется " +
          n +
          " " +
          pluralize(n, "урок", "урока", "уроков") +
          " подряд, стоит закрепить отдельно",
      };
    });

    var patternByCat = {};
    patterns.forEach(function (p) {
      patternByCat[p.error_category] = p;
    });

    sorted.forEach(function (report) {
      report.grammar_errors = (report.grammar_errors || []).map(function (item) {
        var cat = inferErrorCategory(item);
        var pat = patternByCat[cat];
        return Object.assign({}, item, {
          error_category: cat,
          category_label: categoryLabel(cat),
          pattern_status: pat ? pat.status : "inactive",
          consecutive_lessons_count: pat ? pat.consecutive_lessons_count : 0,
        });
      });
    });

    return {
      patterns: patterns,
      stuck_patterns: stuck,
      new_patterns: fresh,
      stuck_topics: stuckTopics,
    };
  }

  function buildPrioritizedWeakTopics(tracking, weakTopics) {
    var items = [];
    var seen = {};
    (tracking.stuck_patterns || []).forEach(function (p) {
      items.push({
        text: p.label,
        priority: "stuck",
        consecutive_lessons_count: p.consecutive_lessons_count,
      });
      seen[p.label.toLowerCase()] = true;
    });
    (tracking.new_patterns || []).forEach(function (p) {
      if (!seen[p.label.toLowerCase()]) {
        items.push({ text: p.label, priority: "new", consecutive_lessons_count: 0 });
        seen[p.label.toLowerCase()] = true;
      }
    });
    (weakTopics || []).forEach(function (topic) {
      var key = String(topic).trim().toLowerCase();
      if (key && !seen[key]) {
        items.push({ text: topic, priority: "normal", consecutive_lessons_count: 0 });
        seen[key] = true;
      }
    });
    return items;
  }

  function refreshErrorTracking() {
    state.errorTracking = buildErrorTracking(state.reports);
    var latest = state.reports[0];
    if (latest) {
      latest.prioritized_weak_topics = buildPrioritizedWeakTopics(
        state.errorTracking,
        latest.weak_topics
      );
    }
  }

  function computeStudyPlanClient(goal, reports, tracking) {
    if (!goal || !goal.target_cefr_level || !goal.goal_set_date) return null;
    if (!reports || !reports.length) return null;

    var durationWeeks = Number(goal.target_duration_weeks);
    if (!durationWeeks && goal.target_date) {
      var start = parseIsoDate(goal.goal_set_date);
      var end = parseIsoDate(goal.target_date);
      if (start && end) durationWeeks = Math.max(1, Math.floor((end - start) / (7 * 86400000)));
    }
    if (!durationWeeks) return null;

    var sorted = reports.slice().sort(function (a, b) {
      return new Date(a.lesson_date || a.created_at || 0) - new Date(b.lesson_date || b.created_at || 0);
    });
    var latest = sorted[sorted.length - 1];
    var startCefr = goal.goal_start_cefr_level || sorted[0].vocabulary_level;
    var currentCefr = latest.vocabulary_level || startCefr;

    var startScore = cefrScore(startCefr);
    var currentScore = cefrScore(currentCefr, latest.fluency_score);
    var targetScore = cefrScore(goal.target_cefr_level);
    if (startScore == null || currentScore == null || targetScore == null) return null;
    if (targetScore <= startScore) return null;

    var typeCoeff = goal.goal_type === "scenario_based" ? SCENARIO_COEFF : 1;
    var trackingData = tracking || state.errorTracking || buildErrorTracking(reports);
    if ((trackingData.stuck_patterns || []).length >= STUCK_LOAD_MIN_CATEGORIES) {
      typeCoeff *= STUCK_LOAD_MULTIPLIER;
    }
    var totalDistance = targetScore - startScore;
    var remainingDistance = Math.max(0, targetScore - currentScore);
    var totalHours = totalDistance * HOURS_PER_CEFR_LEVEL * typeCoeff;

    var curriculumWeeks = durationWeeks;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var goalStart = parseIsoDate(goal.goal_set_date) || today;
    var weeksElapsed = Math.max(0, Math.floor((today - goalStart) / (7 * 86400000)));
    var planEndDate = parseIsoDate(goal.target_date);
    var weeksRemaining;
    var planWeeksTotal = curriculumWeeks;

    if (goal.study_intensity_preset && planEndDate && planEndDate > goalStart) {
      planWeeksTotal = Math.max(1, Math.ceil((planEndDate - goalStart) / (7 * 86400000)));
      weeksRemaining = Math.max(1, Math.ceil((planEndDate - today) / (7 * 86400000)));
    } else {
      weeksRemaining = Math.max(1, curriculumWeeks - weeksElapsed);
    }

    var hoursRemaining = remainingDistance * HOURS_PER_CEFR_LEVEL * typeCoeff;
    var hoursPerWeek = hoursRemaining / weeksRemaining;

    var intensityCfg = getIntensityConfig(goal.study_intensity_preset);
    var tutorLessons = intensityCfg
      ? intensityCfg.tutorLessons
      : Number(goal.tutor_lessons_per_week || 2);
    var tutorMinutes = Number(goal.tutor_lesson_minutes || 60);
    var practiceDays = intensityCfg
      ? intensityCfg.practiceDays
      : Number(goal.practice_days_per_week || 6);
    var tutorHours = tutorLessons * tutorMinutes / 60;
    var selfHours = Math.max(0, hoursPerWeek - tutorHours);
    var minutesPerDay = (hoursPerWeek / practiceDays) * 60;

    var reportsSince = sorted.filter(function (r) {
      var d = parseIsoDate(r.lesson_date || r.created_at);
      return d && d >= goalStart;
    });
    var tutorCompleted = reportsSince.length * tutorMinutes / 60;
    var timeProgress = planWeeksTotal > 0 ? Math.min(1, weeksElapsed / planWeeksTotal) : 0;
    var levelProgress = Math.min(1, Math.max(0, (currentScore - startScore) / totalDistance));
    var hoursCompleted = Math.min(totalHours, Math.max(tutorCompleted, levelProgress * totalHours));

    var status = "on_track";
    if (levelProgress >= timeProgress * 1.1) status = "ahead";
    else if (levelProgress < timeProgress * 0.85) status = "behind";

    var statusMessage =
      status === "ahead"
        ? "Опережаете график — можно сохранить текущий темп"
        : status === "on_track"
          ? "Идёте по плану"
          : "Отстаёте — нужно увеличить нагрузку до " + formatHours(hoursPerWeek) + " ч/нед";

    return {
      hours_per_week: round1(hoursPerWeek),
      minutes_per_day: Math.round(minutesPerDay),
      tutor_hours_per_week: round1(tutorHours),
      self_study_hours_per_week: round1(selfHours),
      total_hours: round1(totalHours),
      hours_completed: round1(hoursCompleted),
      hours_remaining: round1(Math.max(0, totalHours - hoursCompleted)),
      weeks_total: planWeeksTotal,
      weeks_elapsed: weeksElapsed,
      weeks_remaining: weeksRemaining,
      progress_percent: round1(totalHours ? (hoursCompleted / totalHours) * 100 : 0),
      status: status,
      status_message: statusMessage,
      disclaimer: PLAN_DISCLAIMER,
      goal_type: goal.goal_type || "general_level",
      scenario_description: goal.scenario_description || goal.goal_label,
    };
  }

  function round1(n) {
    return Math.round(Number(n) * 10) / 10;
  }

  function formatHours(n) {
    var v = round1(n);
    return String(v).replace(".0", "");
  }

  function getCurrentStudentCefr() {
    var latest = getLatestReport();
    if (!latest || !latest.vocabulary_level) return null;
    var level = String(latest.vocabulary_level).toUpperCase();
    return cefrIndex(level) >= 0 ? level : null;
  }

  function getNextCefrLevel(current) {
    var idx = cefrIndex(current);
    if (idx < 0 || idx >= CEFR_LEVELS.length - 1) return null;
    return CEFR_LEVELS[idx + 1];
  }

  function populateGoalCefrSelect(preselected) {
    var select = document.getElementById("goal-cefr-select");
    var hintEl = document.getElementById("goal-cefr-hint");
    if (!select) return;

    var current = getCurrentStudentCefr();
    var next = current ? getNextCefrLevel(current) : null;
    var selected = preselected || "";

    select.innerHTML = "";
    select.disabled = false;

    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Выберите уровень";
    select.appendChild(placeholder);

    if (!current) {
      CEFR_LEVELS.forEach(function (level) {
        var opt = document.createElement("option");
        opt.value = level;
        opt.textContent = level;
        select.appendChild(opt);
      });
      if (hintEl) hintEl.hidden = true;
    } else if (!next) {
      select.disabled = true;
      placeholder.textContent = "Достигнут максимальный уровень C2";
      if (hintEl) {
        hintEl.textContent = "Новая цель по уровню недоступна — вы уже на C2.";
        hintEl.hidden = false;
      }
    } else {
      CEFR_LEVELS.forEach(function (level) {
        var levelIdx = cefrIndex(level);
        var currentIdx = cefrIndex(current);
        if (levelIdx <= currentIdx) return;

        var opt = document.createElement("option");
        opt.value = level;
        if (level === next) {
          opt.textContent = level;
        } else {
          opt.textContent = level + " — сначала достигните " + next;
          opt.disabled = true;
        }
        select.appendChild(opt);
      });
      if (hintEl) {
        hintEl.textContent =
          "Сейчас " + current + " — можно выбрать только " + next + ".";
        hintEl.hidden = false;
      }
    }

    if (current && next) {
      selected = next;
    }

    if (selected && select.querySelector('option[value="' + selected + '"]:not([disabled])')) {
      select.value = selected;
    }
  }

  function validateGoalCefrChoice(cefr) {
    var current = getCurrentStudentCefr();
    if (!current) return null;
    var next = getNextCefrLevel(current);
    if (!next) {
      return "Вы уже на максимальном уровне CEFR — новую цель по уровню задать нельзя.";
    }
    if (cefr !== next) {
      return "Целевой уровень должен быть следующим: " + next + ".";
    }
    return null;
  }

  function buildDemoProgressTracker(goal, reports) {
    var start = parseIsoDate(goal.goal_set_date);
    var end = parseIsoDate(goal.target_date);
    if (!start || !end) return null;

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var lessonByDate = {};
    (reports || []).forEach(function (report) {
      var lessonDate = parseIsoDate(report.lesson_date || report.created_at);
      if (!lessonDate) return;
      lessonByDate[isoDateOnly(lessonDate)] = 60;
    });

    var days = [];
    var cursor = new Date(start);
    var index = 0;
    var planned = 30;

    while (cursor <= end) {
      index += 1;
      var iso = isoDateOnly(cursor);
      var isPast = cursor <= today;
      var dow = cursor.getDay();

      if (lessonByDate[iso]) {
        days.push({
          date: iso,
          day_index: index,
          planned_minutes: planned,
          completed: true,
          completed_minutes: lessonByDate[iso],
          source: "lesson",
          state: "lesson",
        });
      } else if (isPast && (dow === 0 || dow === 2 || dow === 4) && index % 6 !== 0) {
        days.push({
          date: iso,
          day_index: index,
          planned_minutes: planned,
          completed: true,
          completed_minutes: dow === 0 ? 20 : 25,
          source: "self_practice",
          state: "completed",
        });
      } else if (!isPast) {
        days.push({
          date: iso,
          day_index: index,
          planned_minutes: planned,
          completed: false,
          completed_minutes: null,
          source: null,
          state: "future",
        });
      } else {
        days.push({
          date: iso,
          day_index: index,
          planned_minutes: planned,
          completed: false,
          completed_minutes: null,
          source: null,
          state: "missed",
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    var elapsed = days.filter(function (day) {
      var dayDate = parseIsoDate(day.date);
      return dayDate && dayDate <= today && day.planned_minutes > 0;
    });

    return {
      days: days,
      completed_days: elapsed.filter(function (day) {
        return day.completed;
      }).length,
      planned_days_elapsed: elapsed.length,
      streak: computeActivityStreak(days, today),
      goal_start_date: isoDateOnly(start),
      goal_end_date: isoDateOnly(end),
      can_mark_today: false,
      today_planned_minutes: planned,
    };
  }

  function buildActivityDayMap(tracker) {
    var map = {};
    if (!tracker || !tracker.days) return map;
    tracker.days.forEach(function (day) {
      map[day.date] = day;
    });
    return map;
  }

  function activityIntensityLevel(day) {
    if (!day || !day.completed) return 0;
    if (day.source === "lesson") return 4;
    var mins = day.completed_minutes || day.planned_minutes || 0;
    if (mins >= 45) return 4;
    if (mins >= 30) return 3;
    if (mins >= 15) return 2;
    return 1;
  }

  function computeActivityStreak(days, today) {
    var byDate = {};
    days.forEach(function (day) {
      byDate[day.date] = day;
    });
    var streak = 0;
    var cursor = new Date(today);
    cursor.setHours(0, 0, 0, 0);
    while (true) {
      var iso = isoDateOnly(cursor);
      var row = byDate[iso];
      if (!row) break;
      if (!row.completed) {
        if (streak === 0 && iso === isoDateOnly(today)) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        break;
      }
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function computeLongestActivityStreak(days, today) {
    var sorted = days
      .slice()
      .filter(function (day) {
        var dayDate = parseIsoDate(day.date);
        return dayDate && dayDate <= today;
      })
      .sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });

    var longest = 0;
    var current = 0;
    sorted.forEach(function (day) {
      if (day.completed) {
        current += 1;
        if (current > longest) longest = current;
      } else {
        current = 0;
      }
    });
    return longest;
  }

  function buildActivityStats(tracker, reports) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var totalMinutes = 0;
    var lessonMinutes = 0;
    var selfMinutes = 0;
    var selfStudyDays = 0;

    (tracker.days || []).forEach(function (day) {
      var dayDate = parseIsoDate(day.date);
      if (!dayDate || dayDate > today || !day.completed) return;
      var mins = day.completed_minutes || day.planned_minutes || 0;
      totalMinutes += mins;
      if (day.source === "lesson") {
        lessonMinutes += mins;
      } else if (day.source === "self_practice") {
        selfMinutes += mins;
        selfStudyDays += 1;
      }
    });

    return {
      totalMinutes: totalMinutes,
      lessonMinutes: lessonMinutes,
      selfMinutes: selfMinutes,
      lessonCount: (reports || []).length,
      selfStudyDays: selfStudyDays,
      streak: tracker.streak || 0,
      longestStreak: computeLongestActivityStreak(tracker.days || [], today),
    };
  }

  function formatDurationHoursMinutes(totalMinutes) {
    var mins = Math.max(0, Math.round(totalMinutes || 0));
    if (!mins) return "0 мин";
    var hours = Math.floor(mins / 60);
    var rest = mins % 60;
    if (hours > 0 && rest > 0) return hours + " ч " + rest + " мин";
    if (hours > 0) return hours + " ч";
    return rest + " мин";
  }

  function formatDurationMinutes(totalMinutes) {
    return Math.max(0, Math.round(totalMinutes || 0)) + " мин";
  }

  function buildActivityDaySummary(iso, tracker) {
    var day = buildActivityDayMap(tracker)[iso];
    var teacherMinutes = 0;
    var agentMinutes = 0;

    if (day && day.completed) {
      var mins = day.completed_minutes || day.planned_minutes || 0;
      if (day.source === "lesson") teacherMinutes = mins;
      else if (day.source === "self_practice") agentMinutes = mins;
    }

    return {
      platformMinutes: teacherMinutes + agentMinutes,
      agentMinutes: agentMinutes,
      teacherMinutes: teacherMinutes,
      hasActivity: !!(day && day.completed),
    };
  }

  function formatActivityDayPopoverDate(iso) {
    var date = parseIsoDate(iso);
    if (!date) return "—";
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function closeActivityDayPopover() {
    var popover = document.getElementById("activity-day-popover");
    if (popover) popover.hidden = true;
    state.activityPopoverDate = null;
    document.querySelectorAll(".activity-heatmap-cell.is-selected").forEach(function (cell) {
      cell.classList.remove("is-selected");
    });
  }

  function showActivityDayPopover(anchorEl, iso) {
    var popover = document.getElementById("activity-day-popover");
    var tile = document.querySelector(".activity-tile--heatmap");
    if (!popover || !tile || !anchorEl || !state.progressTracker) return;

    if (state.activityPopoverDate === iso && !popover.hidden) {
      closeActivityDayPopover();
      return;
    }

    var summary = buildActivityDaySummary(iso, state.progressTracker);
    setText("activity-day-popover-date", formatActivityDayPopoverDate(iso));
    setText("activity-day-platform", formatDurationHoursMinutes(summary.platformMinutes));
    setText("activity-day-agent", formatDurationMinutes(summary.agentMinutes));
    setText("activity-day-teacher", formatDurationMinutes(summary.teacherMinutes));

    document.querySelectorAll(".activity-heatmap-cell.is-selected").forEach(function (cell) {
      cell.classList.remove("is-selected");
    });
    anchorEl.classList.add("is-selected");
    state.activityPopoverDate = iso;

    popover.hidden = false;
    popover.style.visibility = "hidden";
    popover.style.left = "0px";
    popover.style.top = "0px";
    popover.style.transform = "none";

    var tileRect = tile.getBoundingClientRect();
    var anchorRect = anchorEl.getBoundingClientRect();
    var popRect = popover.getBoundingClientRect();
    var left = anchorRect.left - tileRect.left + anchorRect.width / 2;
    var top = anchorRect.top - tileRect.top - 8;

    var minLeft = popRect.width / 2 + 8;
    var maxLeft = tileRect.width - popRect.width / 2 - 8;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    var minTop = popRect.height + 8;
    if (top < minTop) {
      top = anchorRect.bottom - tileRect.top + 8;
      popover.style.transform = "translate(-50%, 0)";
    } else {
      popover.style.transform = "translate(-50%, -100%)";
    }

    popover.style.left = left + "px";
    popover.style.top = top + "px";
    popover.style.visibility = "visible";
  }

  function bindActivityHeatmapInteractions(container) {
    if (!container) return;
    container.querySelectorAll(".activity-heatmap-cell[data-date]").forEach(function (cell) {
      cell.addEventListener("click", function (event) {
        event.stopPropagation();
        showActivityDayPopover(cell, cell.dataset.date);
      });
    });
  }

  function initActivityHeatmapPopover() {
    if (state.activityPopoverBound) return;
    state.activityPopoverBound = true;

    document.addEventListener("click", function (event) {
      var popover = document.getElementById("activity-day-popover");
      if (!popover || popover.hidden) return;
      if (
        event.target.closest("#activity-day-popover") ||
        event.target.closest(".activity-heatmap-cell[data-date]")
      ) {
        return;
      }
      closeActivityDayPopover();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeActivityDayPopover();
    });
  }

  function formatHeatmapCellLabel(cellDate, day) {
    var label = formatActivityDayPopoverDate(isoDateOnly(cellDate));
    if (!day || !day.completed) return label + " — нет занятий";
    var mins = day.completed_minutes || day.planned_minutes || 0;
    return label + " — на платформе " + formatDurationHoursMinutes(mins);
  }

  function renderActivityPlanGauge(pct) {
    var el = document.getElementById("activity-plan-gauge");
    if (!el) return;
    var clamped = Math.min(100, Math.max(0, Math.round(pct)));
    var arcLen = 132;
    var offset = arcLen - (arcLen * clamped) / 100;
    el.innerHTML =
      '<svg class="activity-gauge-svg" viewBox="0 0 100 56" aria-hidden="true">' +
      '<path class="activity-gauge-track" d="M10 46 A40 40 0 0 1 90 46" pathLength="132" />' +
      '<path class="activity-gauge-fill" d="M10 46 A40 40 0 0 1 90 46" pathLength="132" stroke-dasharray="132" stroke-dashoffset="' +
      offset +
      '" />' +
      "</svg>" +
      '<span class="activity-gauge-text">' +
      clamped +
      "% плана</span>";
  }

  function renderActivityBreakdown(stats) {
    var el = document.getElementById("activity-breakdown");
    if (!el) return;

    var total = stats.lessonMinutes + stats.selfMinutes;
    if (!total) {
      el.innerHTML = '<p class="activity-tile-detail">Пока нет данных о занятиях.</p>';
      return;
    }

    var lessonPct = Math.round((stats.lessonMinutes / total) * 100);
    var selfPct = 100 - lessonPct;

    function barRow(pct, label, kind) {
      return (
        '<div class="activity-bar activity-bar--' +
        kind +
        '">' +
        '<div class="activity-bar-inner" style="width:' +
        Math.max(18, pct) +
        '%">' +
        '<span class="activity-bar-pct">' +
        pct +
        "%</span>" +
        '<span class="activity-bar-label">' +
        esc(label) +
        "</span>" +
        "</div></div>"
      );
    }

    el.innerHTML =
      barRow(lessonPct, "Уроки · " + stats.lessonMinutes + " мин", "lesson") +
      barRow(selfPct, "Self-study · " + stats.selfMinutes + " мин", "self");
  }

  function renderActivityHeatmap(container, tracker) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var endSunday = new Date(today);
    endSunday.setDate(endSunday.getDate() - endSunday.getDay());
    var startSunday = new Date(endSunday);
    startSunday.setDate(startSunday.getDate() - (ACTIVITY_HEATMAP_WEEKS - 1) * 7);

    var dayMap = buildActivityDayMap(tracker);
    var monthCells = ["<span></span>"];
    var monthSeen = {};
    var week;
    for (week = 0; week < ACTIVITY_HEATMAP_WEEKS; week += 1) {
      var weekStart = new Date(startSunday);
      weekStart.setDate(weekStart.getDate() + week * 7);
      var monthKey = weekStart.getFullYear() + "-" + weekStart.getMonth();
      var monthLabel = "";
      if (!monthSeen[monthKey]) {
        monthSeen[monthKey] = true;
        monthLabel = MONTH_SHORT_RU[weekStart.getMonth()];
      }
      monthCells.push("<span>" + esc(monthLabel) + "</span>");
    }

    var cells = [];
    var dow;
    for (dow = 0; dow < 7; dow += 1) {
      for (week = 0; week < ACTIVITY_HEATMAP_WEEKS; week += 1) {
        var cellDate = new Date(startSunday);
        cellDate.setDate(cellDate.getDate() + week * 7 + dow);
        var iso = isoDateOnly(cellDate);
        var day = dayMap[iso];
        var level = activityIntensityLevel(day);
        var classes = "activity-heatmap-cell level-" + level;
        var isFuture = cellDate > today;
        if (isFuture) classes += " is-future";
        if (day && day.source === "lesson") classes += " is-lesson";
        if (isFuture) {
          cells.push('<span class="' + classes + '" aria-hidden="true"></span>');
        } else {
          cells.push(
            '<button type="button" class="' +
              classes +
              '" data-date="' +
              esc(iso) +
              '" aria-label="' +
              esc(formatHeatmapCellLabel(cellDate, day)) +
              '" aria-haspopup="dialog"></button>'
          );
        }
      }
    }

    var dowLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    var dowHtml = dowLabels
      .map(function (label) {
        return "<span>" + label + "</span>";
      })
      .join("");

    container.innerHTML =
      '<div class="activity-heatmap">' +
      '<div class="activity-heatmap-months">' +
      monthCells.join("") +
      "</div>" +
      '<div class="activity-heatmap-body">' +
      '<div class="activity-heatmap-dows">' +
      dowHtml +
      "</div>" +
      '<div class="activity-heatmap-cells">' +
      cells.join("") +
      "</div>" +
      "</div>" +
      "</div>";
    bindActivityHeatmapInteractions(container);
    closeActivityDayPopover();
  }

  function renderActivity() {
    var emptyEl = document.getElementById("activity-empty");
    var contentEl = document.getElementById("activity-content");
    if (!emptyEl || !contentEl) return;

    if (!hasGoal() || !state.progressTracker) {
      emptyEl.hidden = false;
      contentEl.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    contentEl.hidden = false;

    var stats = buildActivityStats(state.progressTracker, state.reports);
    var planTotalMinutes =
      state.studyPlan && state.studyPlan.total_hours
        ? Math.round(state.studyPlan.total_hours * 60)
        : 0;
    var planPct =
      planTotalMinutes > 0
        ? Math.min(100, Math.round((stats.totalMinutes / planTotalMinutes) * 100))
        : 0;

    setText("activity-metric-minutes", String(stats.totalMinutes));
    setText("activity-metric-lessons", String(stats.lessonCount));
    setText("activity-metric-self-study", String(stats.selfStudyDays));
    setText("activity-metric-streak", String(stats.streak));
    setText("activity-lesson-minutes", stats.lessonMinutes + " мин на уроках");
    setText("activity-total-kicker", "Всего мин | " + stats.totalMinutes);
    renderActivityPlanGauge(planPct);
    setText(
      "activity-heatmap-streak",
      stats.streak +
        " " +
        pluralize(stats.streak, "день", "дня", "дней") +
        " подряд"
    );
    setText(
      "activity-heatmap-longest",
      "Лучшая серия | " +
        stats.longestStreak +
        " " +
        pluralize(stats.longestStreak, "день", "дня", "дней")
    );

    renderActivityBreakdown(stats);
    var heatmapEl = document.getElementById("activity-heatmap");
    if (heatmapEl) renderActivityHeatmap(heatmapEl, state.progressTracker);
  }

  function formatGoalShortLabel(goal) {
    if (!goal) return "цель";
    if (goal.goal_type === "scenario_based") {
      var scenario = String(goal.scenario_description || goal.goal_label || "").trim();
      if (scenario) return "«" + scenario + "»";
    }
    if (goal.goal_label) return "«" + goal.goal_label + "»";
    return "уровень " + (goal.target_cefr_level || "—");
  }

  function formatAnalyticsGoalLead(goal) {
    if (!goal) return "—";
    if (goal.goal_type === "scenario_based" && goal.scenario_description) {
      return (
        "Прикладная цель: «" +
        goal.scenario_description +
        "». Потолок по уровню — " +
        (goal.target_cefr_level || "—") +
        "."
      );
    }
    if (goal.goal_label) return "«" + goal.goal_label + "»";
    return "Достичь уровня " + (goal.target_cefr_level || "—");
  }

  function countConsecutiveInactiveDays(tracker) {
    if (!tracker || !tracker.days) return 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var map = buildActivityDayMap(tracker);
    var streak = 0;
    var cursor = new Date(today);

    while (true) {
      var iso = isoDateOnly(cursor);
      var day = map[iso];
      if (!day) break;
      if (day.state === "future") {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      if (day.completed) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function daysSinceLastActivity(tracker) {
    if (!tracker || !tracker.days) return 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var last = null;
    tracker.days.forEach(function (day) {
      if (!day.completed) return;
      var d = parseIsoDate(day.date);
      if (!d || d > today) return;
      if (!last || d > last) last = d;
    });
    if (!last) {
      var start = parseIsoDate(tracker.goal_start_date);
      if (start && start <= today) {
        return Math.floor((today - start) / 86400000);
      }
      return 0;
    }
    return Math.floor((today - last) / 86400000);
  }

  function sumMinutesInLastDays(tracker, dayCount) {
    if (!tracker || !tracker.days) return 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - (dayCount - 1));

    return tracker.days.reduce(function (sum, day) {
      if (!day.completed) return sum;
      var d = parseIsoDate(day.date);
      if (!d || d < cutoff || d > today) return sum;
      return sum + (day.completed_minutes || day.planned_minutes || 0);
    }, 0);
  }

  function countLessonsInCurrentWeek(reports) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var weekStart = new Date(today);
    var mondayOffset = (today.getDay() + 6) % 7;
    weekStart.setDate(today.getDate() - mondayOffset);

    return (reports || []).filter(function (report) {
      var d = parseIsoDate(report.lesson_date || report.created_at);
      return d && d >= weekStart && d <= today;
    }).length;
  }

  function buildPaceVerdict(insights, plan) {
    var levelPct = Math.round(insights.levelProgress * 100);
    var timePct = Math.round(insights.timeProgress * 100);
    var gap = levelPct - timePct;

    if (plan.status === "ahead" || gap >= 10) {
      return (
        "Вы опережаете график на ~" +
        Math.abs(gap) +
        "%. При сохранении темпа цель " +
        formatGoalShortLabel(state.goal) +
        " достижима раньше срока."
      );
    }
    if (plan.status === "behind" || gap <= -10) {
      return (
        "Вы отстаёте на ~" +
        Math.abs(gap) +
        "% от графика. Без дополнительных занятий цель к " +
        formatDateLocal(state.goal.target_date) +
        " под угрозой — прогресс теряется."
      );
    }
    return "Темп совпадает с планом — продолжайте в том же ритме, чтобы уложиться в дедлайн.";
  }

  function buildGoalPaceInsights() {
    if (!hasGoal() || !state.studyPlan || !state.progressTracker) return null;

    var plan = state.studyPlan;
    var goal = state.goal;
    var tracker = state.progressTracker;
    var alerts = [];

    var inactiveStreak = countConsecutiveInactiveDays(tracker);
    var daysSinceVisit = daysSinceLastActivity(tracker);
    var weekMinutes = sumMinutesInLastDays(tracker, 7);
    var requiredWeekMinutes = Math.max(1, Math.round(plan.hours_per_week * 60));
    var minWeekThreshold = Math.round(requiredWeekMinutes * 0.55);

    var tutorExpected = Number(goal.tutor_lessons_per_week) || 2;
    var intensityCfg = getIntensityConfig(goal.study_intensity_preset);
    if (intensityCfg) tutorExpected = intensityCfg.tutorLessons;
    var lessonsThisWeek = countLessonsInCurrentWeek(state.reports);
    var weekdayIndex = (new Date().getDay() + 6) % 7;

    var timeProgress =
      plan.weeks_total > 0 ? Math.min(1, plan.weeks_elapsed / plan.weeks_total) : 0;
    var levelProgress =
      plan.total_hours > 0 ? Math.min(1, plan.hours_completed / plan.total_hours) : 0;

    var goalLabel = formatGoalShortLabel(goal);

    if (inactiveStreak >= 3) {
      alerts.push({
        severity: "danger",
        title: "Вы пропускаете занятия",
        message:
          "Уже " +
          inactiveStreak +
          " " +
          pluralize(inactiveStreak, "день", "дня", "дней") +
          " подряд без активности на платформе. При таком темпе " +
          goalLabel +
          " недостижима — прогресс теряется.",
      });
    } else if (inactiveStreak >= 1) {
      alerts.push({
        severity: "warning",
        title: "Пропуск на платформе",
        message:
          inactiveStreak === 1
            ? "Сегодня или вчера не было занятий. Вернитесь к плану, чтобы не отстать от графика."
            : "Уже " +
              inactiveStreak +
              " " +
              pluralize(inactiveStreak, "день", "дня", "дней") +
              " без активности. Регулярность важнее для цели, чем редкие длинные сессии.",
      });
    }

    if (daysSinceVisit >= 3 && inactiveStreak < 3) {
      alerts.push({
        severity: "warning",
        title: "Долго не заходили на платформу",
        message:
          "Последняя активность — " +
          daysSinceVisit +
          " " +
          pluralize(daysSinceVisit, "день", "дня", "дней") +
          " назад. Без практики навыки деградируют, а срок цели не сдвигается.",
      });
    }

    if (plan.weeks_elapsed > 0 && weekMinutes < minWeekThreshold) {
      alerts.push({
        severity: "warning",
        title: "Мало времени на платформе",
        message:
          "За 7 дней — " +
          weekMinutes +
          " мин из рекомендуемых " +
          requiredWeekMinutes +
          " мин/нед (~" +
          plan.minutes_per_day +
          " мин в дни практики). Увеличьте нагрузку, иначе отстанете от плана.",
      });
    }

    if (weekdayIndex >= 2 && lessonsThisWeek < tutorExpected) {
      var missedLessons = tutorExpected - lessonsThisWeek;
      alerts.push({
        severity: "warning",
        title: missedLessons > 1 ? "Пропущены уроки" : "Пропущен урок",
        message:
          "На этой неделе " +
          lessonsThisWeek +
          " из " +
          tutorExpected +
          " уроков с репетитором. Каждый пропуск замедляет движение к " +
          goalLabel +
          ".",
      });
    }

    if (plan.status === "behind") {
      alerts.push({
        severity: "danger",
        title: "Отставание от плана",
        message:
          plan.status_message ||
          "Нужно увеличить нагрузку до " + formatHours(plan.hours_per_week) + " ч/нед.",
      });
    } else if (plan.status === "ahead") {
      alerts.push({
        severity: "success",
        title: "Опережаете план",
        message:
          "Текущий темп выше графика — при сохранении интенсивности достигнете цели раньше срока.",
      });
    }

    if (!goal.study_intensity_preset) {
      alerts.push({
        severity: "info",
        title: "Задайте интенсивность",
        message:
          "Выберите, как часто готовы заниматься — мы покажем реалистичную дату достижения цели.",
      });
    }

    return {
      alerts: alerts,
      inactiveStreak: inactiveStreak,
      daysSinceVisit: daysSinceVisit,
      weekMinutes: weekMinutes,
      requiredWeekMinutes: requiredWeekMinutes,
      lessonsThisWeek: lessonsThisWeek,
      lessonsExpectedWeek: tutorExpected,
      timeProgress: timeProgress,
      levelProgress: levelProgress,
      paceVerdict: buildPaceVerdict(
        { levelProgress: levelProgress, timeProgress: timeProgress },
        plan
      ),
    };
  }

  function renderGoalPaceAlerts(alerts) {
    var container = document.getElementById("analytics-goal-alerts");
    if (!container) return;
    if (!alerts || !alerts.length) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }

    var icons = {
      danger: "!",
      warning: "!",
      success: "✓",
      info: "i",
    };

    container.hidden = false;
    container.innerHTML = alerts
      .map(function (alert) {
        return (
          '<article class="analytics-goal-alert is-' +
          esc(alert.severity) +
          '">' +
          '<span class="analytics-goal-alert-icon" aria-hidden="true">' +
          esc(icons[alert.severity] || "·") +
          "</span>" +
          '<div class="analytics-goal-alert-body">' +
          '<p class="analytics-goal-alert-title">' +
          esc(alert.title) +
          "</p>" +
          '<p class="analytics-goal-alert-message">' +
          esc(alert.message) +
          "</p>" +
          "</div></article>"
        );
      })
      .join("");
  }

  function setAnalyticsPaceCardState(elementId, stateName) {
    var el = document.getElementById(elementId);
    var card = el ? el.closest(".analytics-pace-card") : null;
    if (!card) return;
    card.classList.remove("is-warning", "is-danger");
    if (stateName) card.classList.add(stateName);
  }

  function renderAnalyticsGoalPlan() {
    var emptyEl = document.getElementById("analytics-goal-empty");
    var contentEl = document.getElementById("analytics-goal-content");
    if (!emptyEl || !contentEl) return;

    if (!hasGoal() || !state.studyPlan || !state.progressTracker) {
      emptyEl.hidden = false;
      contentEl.hidden = true;
      renderGoalPaceAlerts([]);
      return;
    }

    emptyEl.hidden = true;
    contentEl.hidden = false;

    var plan = state.studyPlan;
    var goal = state.goal;
    var insights = buildGoalPaceInsights();
    if (!insights) return;

    renderGoalPaceAlerts(insights.alerts);

    setText("analytics-goal-lead", formatAnalyticsGoalLead(goal));
    setText(
      "analytics-goal-target",
      goal.goal_type === "scenario_based" && goal.scenario_description
        ? goal.scenario_description
        : "Уровень " + (goal.target_cefr_level || "—")
    );
    setText("analytics-goal-deadline", "к " + formatDateLocal(goal.target_date));
    setText("analytics-goal-remaining", formatRemainingDaysShort(goal.target_date));

    var badge = document.getElementById("analytics-plan-status-badge");
    if (badge) {
      badge.textContent = compactPlanStatusMessage(plan);
      badge.className = "plan-status-badge " + (plan.status || "on_track");
    }

    var progressPct = Math.min(100, Math.round(plan.progress_percent || 0));
    setText("analytics-goal-progress-pct", progressPct + "%");
    var heroFill = document.getElementById("analytics-goal-progress-fill");
    if (heroFill) heroFill.style.width = progressPct + "%";

    var levelPct = Math.round(insights.levelProgress * 100);
    var timePct = Math.round(insights.timeProgress * 100);
    setText("analytics-pace-level-pct", levelPct + "%");
    setText("analytics-pace-time-pct", timePct + "%");
    var levelFill = document.getElementById("analytics-pace-level-fill");
    var timeFill = document.getElementById("analytics-pace-time-fill");
    if (levelFill) levelFill.style.width = levelPct + "%";
    if (timeFill) timeFill.style.width = timePct + "%";
    setText("analytics-pace-verdict", insights.paceVerdict);

    syncIntensityUi("analytics");

    setText(
      "analytics-pace-required",
      formatHours(plan.hours_per_week) + " ч/нед"
    );
    setText(
      "analytics-pace-required-hint",
      plan.minutes_per_day + " мин/день · " + formatHours(plan.total_hours) + " ч всего"
    );

    setText(
      "analytics-pace-actual",
      formatDurationHoursMinutes(insights.weekMinutes)
    );
    setText(
      "analytics-pace-actual-hint",
      insights.weekMinutes >= insights.requiredWeekMinutes
        ? "В пределах недельной нормы"
        : "Нужно ещё ~" +
            Math.max(0, insights.requiredWeekMinutes - insights.weekMinutes) +
            " мин"
    );
    setAnalyticsPaceCardState(
      "analytics-pace-actual",
      insights.weekMinutes < insights.requiredWeekMinutes * 0.55 ? "is-warning" : null
    );

    setText(
      "analytics-pace-lessons",
      insights.lessonsThisWeek + " / " + insights.lessonsExpectedWeek
    );
    setText(
      "analytics-pace-lessons-hint",
      insights.lessonsThisWeek >= insights.lessonsExpectedWeek
        ? "План по урокам выполнен"
        : "Не хватает " +
            (insights.lessonsExpectedWeek - insights.lessonsThisWeek) +
            " " +
            pluralize(
              insights.lessonsExpectedWeek - insights.lessonsThisWeek,
              "урока",
              "уроков",
              "уроков"
            )
    );
    setAnalyticsPaceCardState(
      "analytics-pace-lessons",
      insights.lessonsThisWeek < insights.lessonsExpectedWeek ? "is-warning" : null
    );

    var visitValue =
      insights.daysSinceVisit === 0
        ? "Сегодня"
        : insights.daysSinceVisit +
          " " +
          pluralize(insights.daysSinceVisit, "день", "дня", "дней") +
          " назад";
    setText("analytics-pace-visit", visitValue);
    setText(
      "analytics-pace-visit-hint",
      insights.inactiveStreak >= 3
        ? "Серия пропусков — " + insights.inactiveStreak + " дн."
        : insights.daysSinceVisit <= 1
          ? "Регулярность сохраняется"
          : "Вернитесь к занятиям как можно скорее"
    );
    setAnalyticsPaceCardState(
      "analytics-pace-visit",
      insights.daysSinceVisit >= 3 || insights.inactiveStreak >= 3 ? "is-danger" : null
    );

    setText(
      "analytics-study-plan-headline",
      "Нужно " + formatHours(plan.hours_per_week) + " ч/нед (" + plan.minutes_per_day + " мин/день)"
    );
    setText(
      "analytics-study-plan-breakdown",
      formatHours(plan.tutor_hours_per_week) +
        " ч репетитор · " +
        formatHours(plan.self_study_hours_per_week) +
        " ч практика"
    );
    setText(
      "analytics-study-plan-progress-text",
      "Пройдено " + formatHours(plan.hours_completed) + " из " + formatHours(plan.total_hours) + " ч"
    );
    setText(
      "analytics-study-plan-weeks-left",
      goal.study_intensity_preset && goal.target_date
        ? formatIntensityProjectionText(
            goal.study_intensity_preset,
            goal,
            plan,
            state.reports
          )
        : "При текущем темпе: ещё ~" +
            plan.weeks_remaining +
            " " +
            pluralize(plan.weeks_remaining, "неделя", "недели", "недель")
    );

    var planFill = document.getElementById("analytics-study-plan-progress-fill");
    if (planFill) planFill.style.width = Math.min(100, plan.progress_percent) + "%";

    var disclaimerEl = document.getElementById("analytics-study-plan-disclaimer");
    if (disclaimerEl) {
      disclaimerEl.textContent = PLAN_DISCLAIMER_SHORT;
      disclaimerEl.title = plan.disclaimer || PLAN_DISCLAIMER;
    }
  }

  function renderStudentGoal() {
    var detailsEl = document.getElementById("goal-details");
    var ctaEl = document.getElementById("btn-set-goal-cta");
    var goalPlanSection = document.getElementById("sidebar-goal-plan-section");
    var targetEl = document.getElementById("dash-cefr-target");
    var targetBlock = document.getElementById("cefr-target-block");
    var captionEl = document.getElementById("cefr-target-caption");
    var descEl = document.getElementById("goal-info-desc");

    if (!detailsEl || !ctaEl || !targetEl) return;

    if (hasGoal()) {
      targetEl.textContent = state.goal.target_cefr_level;
      if (targetBlock) targetBlock.classList.add("has-goal");

      var scenarioText = String(state.goal.scenario_description || "").trim();
      var isScenarioWithDescription =
        state.goal.goal_type === "scenario_based" && scenarioText;

      if (captionEl) {
        captionEl.textContent = isScenarioWithDescription ? "Потолок цели" : "Цель";
      }

      setText("goal-deadline", "к " + formatDateLocal(state.goal.target_date));
      setText("goal-remaining", formatRemainingDaysShort(state.goal.target_date));

      if (descEl) {
        if (isScenarioWithDescription) {
          descEl.textContent =
            "Прикладная цель «" +
            scenarioText +
            "» — план не требует полного " +
            state.goal.target_cefr_level;
        } else if (state.goal.goal_label) {
          descEl.textContent = "«" + state.goal.goal_label + "»";
        } else {
          descEl.textContent =
            "Достичь уровня " + (state.goal.target_cefr_level || "—");
        }
      }

      if (goalPlanSection) goalPlanSection.hidden = false;
      ctaEl.hidden = true;
    } else {
      targetEl.textContent = "—";
      if (targetBlock) targetBlock.classList.remove("has-goal");
      if (captionEl) captionEl.textContent = "Цель";
      if (descEl) descEl.textContent = "";
      if (goalPlanSection) goalPlanSection.hidden = true;
      ctaEl.hidden = false;
    }
  }

  function formatGoalPlanDate(iso) {
    var d = parseIsoDate(iso);
    if (!d) return "—";
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function shortPlanStatusMessage(plan) {
    if (!plan) return "—";
    if (plan.status === "ahead") return "Опережаете";
    if (plan.status === "on_track") return "По плану";
    if (plan.status === "behind") return "Отстаёте";
    return "—";
  }

  function buildGoalPlanSummaryParts() {
    if (!hasGoal() || !state.studyPlan) return null;
    var plan = state.studyPlan;
    var date = formatGoalPlanDate(state.goal.target_date);
    var hours = formatHours(plan.hours_per_week) + " ч/нед";
    return {
      expanded: date + " · " + hours + " · " + compactPlanStatusMessage(plan),
      chipText: date + " · " + hours,
      chipBadge: shortPlanStatusMessage(plan),
      chipBadgeClass: plan.status || "on_track",
    };
  }

  function renderGoalPlanSummary() {
    var parts = buildGoalPlanSummaryParts();
    var expandedEl = document.getElementById("goal-plan-summary-expanded");
    var chipTextEl = document.getElementById("goal-plan-chip-text");
    var chipBadgeEl = document.getElementById("goal-plan-chip-badge");
    if (!parts) return;
    if (expandedEl) expandedEl.textContent = parts.expanded;
    if (chipTextEl) chipTextEl.textContent = parts.chipText;
    if (chipBadgeEl) {
      chipBadgeEl.textContent = parts.chipBadge;
      chipBadgeEl.className = "plan-status-badge " + parts.chipBadgeClass;
    }
  }

  function syncGoalPlanCollapse() {
    var section = document.getElementById("sidebar-goal-plan-section");
    var toggle = document.getElementById("goal-plan-toggle");
    var expandedSummary = document.getElementById("goal-plan-summary-expanded");
    var chip = document.getElementById("goal-plan-collapsed-chip");
    var panel = document.getElementById("goal-plan-panel");
    var sidebar = document.querySelector(".sidebar");
    if (!section || !hasGoal()) return;

    var collapsed = state.goalPlanCollapsed;
    section.classList.toggle("is-collapsed", collapsed);
    if (sidebar) sidebar.classList.toggle("is-goal-plan-collapsed", collapsed);
    if (toggle) toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (expandedSummary) expandedSummary.hidden = collapsed;
    if (chip) chip.hidden = !collapsed;
    if (panel) panel.setAttribute("aria-hidden", collapsed ? "true" : "false");
  }

  function initGoalPlanCollapse() {
    if (state.goalPlanCollapseBound) return;
    state.goalPlanCollapseBound = true;

    try {
      state.goalPlanCollapsed = localStorage.getItem(GOAL_PLAN_COLLAPSED_KEY) === "true";
    } catch (err) {
      state.goalPlanCollapsed = false;
    }

    var toggle = document.getElementById("goal-plan-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", function () {
      state.goalPlanCollapsed = !state.goalPlanCollapsed;
      try {
        localStorage.setItem(
          GOAL_PLAN_COLLAPSED_KEY,
          state.goalPlanCollapsed ? "true" : "false"
        );
      } catch (err) {
        /* ignore quota / private mode */
      }
      syncGoalPlanCollapse();
    });
  }

  function compactPlanStatusMessage(plan) {
    if (plan.status === "ahead") return "Опережаете график";
    if (plan.status === "on_track") return "Идёте по плану";
    if (plan.status === "behind") {
      return "Отстаёте — до " + formatHours(plan.hours_per_week) + " ч/нед";
    }
    return plan.status_message || "—";
  }

  function renderStudyPlan() {
    var section = document.getElementById("sidebar-goal-plan-section");
    var card = document.getElementById("study-plan-card");
    if (!section || !card) return;

    var plan = state.studyPlan;
    if (!hasGoal() || !plan) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    setText("study-plan-title", "План на " + plan.weeks_total + " " + pluralize(plan.weeks_total, "неделю", "недели", "недель"));

    var badge = document.getElementById("plan-status-badge");
    if (badge) {
      badge.textContent = compactPlanStatusMessage(plan);
      badge.className = "plan-status-badge " + (plan.status || "on_track");
    }

    setText(
      "study-plan-headline",
      "Нужно " + formatHours(plan.hours_per_week) + " ч/нед (" + plan.minutes_per_day + " мин/день)"
    );
    setText(
      "study-plan-breakdown",
      formatHours(plan.tutor_hours_per_week) +
        " ч репетитор · " +
        formatHours(plan.self_study_hours_per_week) +
        " ч практика"
    );
    setText(
      "study-plan-progress-text",
      "Пройдено " + formatHours(plan.hours_completed) + " из " + formatHours(plan.total_hours) + " ч"
    );
    setText(
      "study-plan-weeks-left",
      state.goal.study_intensity_preset && state.goal.target_date
        ? formatIntensityProjectionText(
            state.goal.study_intensity_preset,
            state.goal,
            plan,
            state.reports
          )
        : "При текущем темпе: ещё ~" +
            plan.weeks_remaining +
            " " +
            pluralize(plan.weeks_remaining, "неделя", "недели", "недель")
    );

    var fill = document.getElementById("study-plan-progress-fill");
    if (fill) fill.style.width = Math.min(100, plan.progress_percent) + "%";

    var disclaimerEl = document.getElementById("study-plan-disclaimer");
    if (disclaimerEl) {
      disclaimerEl.textContent = PLAN_DISCLAIMER_SHORT;
      disclaimerEl.title = plan.disclaimer || PLAN_DISCLAIMER;
    }

    syncIntensityUi("sidebar");
    renderGoalPlanSummary();
    syncGoalPlanCollapse();
    syncStudyPlanCollapse();
  }

  function isMobileLayout() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function getSidebarMaxWidth() {
    var app = document.querySelector(".app");
    if (!app) return SIDEBAR_WIDTH_MAX;
    var byRatio = app.getBoundingClientRect().width * SIDEBAR_WIDTH_MAX_RATIO;
    return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, byRatio));
  }

  function clampSidebarWidth(width) {
    return Math.round(
      Math.min(getSidebarMaxWidth(), Math.max(SIDEBAR_WIDTH_MIN, width))
    );
  }

  function applySidebarWidth(width) {
    document.documentElement.style.setProperty("--sidebar-width", width + "px");
  }

  function readStoredSidebarWidth() {
    try {
      var raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      if (!raw) return SIDEBAR_WIDTH_DEFAULT;
      var parsed = parseInt(raw, 10);
      if (!isFinite(parsed)) return SIDEBAR_WIDTH_DEFAULT;
      return clampSidebarWidth(parsed);
    } catch (err) {
      return SIDEBAR_WIDTH_DEFAULT;
    }
  }

  function saveSidebarWidth(width) {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clampSidebarWidth(width)));
    } catch (err) {
      /* ignore quota / private mode */
    }
  }

  function resetSidebarWidthForMobile() {
    document.documentElement.style.removeProperty("--sidebar-width");
  }

  function syncSidebarWidthLayout() {
    if (isMobileLayout()) {
      resetSidebarWidthForMobile();
      return;
    }
    applySidebarWidth(readStoredSidebarWidth());
  }

  function initSidebarResize() {
    var edge = document.getElementById("sidebar-resize-edge");
    var shell = document.getElementById("sidebar-shell");
    if (!edge || !shell) return;

    syncSidebarWidthLayout();

    var dragging = false;
    var startX = 0;
    var startWidth = 0;

    function stopDragging() {
      if (!dragging) return;
      dragging = false;
      shell.classList.remove("is-resize-active");
      document.body.classList.remove("sidebar-resizing");
      if (isMobileLayout()) return;
      saveSidebarWidth(shell.getBoundingClientRect().width);
    }

    edge.addEventListener("mousedown", function (e) {
      if (isMobileLayout() || e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startWidth = shell.getBoundingClientRect().width;
      shell.classList.add("is-resize-active");
      document.body.classList.add("sidebar-resizing");
    });

    document.addEventListener("mousemove", function (e) {
      if (!dragging || isMobileLayout()) return;
      e.preventDefault();
      applySidebarWidth(clampSidebarWidth(startWidth + (e.clientX - startX)));
    });

    document.addEventListener("mouseup", stopDragging);
    window.addEventListener("blur", stopDragging);

    window.addEventListener("resize", function () {
      if (isMobileLayout()) {
        resetSidebarWidthForMobile();
        return;
      }
      applySidebarWidth(readStoredSidebarWidth());
    });
  }

  function syncStudyPlanCollapse() {
    var card = document.getElementById("study-plan-card");
    var toggle = document.getElementById("study-plan-mobile-toggle");
    if (!card || !toggle) return;

    if (isMobileLayout() && hasGoal() && state.studyPlan) {
      card.classList.add("is-collapsed");
      toggle.setAttribute("aria-expanded", "false");
    } else {
      card.classList.remove("is-collapsed");
      toggle.setAttribute("aria-expanded", "true");
    }
  }

  function initStudyPlanCollapse() {
    if (state.studyPlanCollapseBound) return;
    state.studyPlanCollapseBound = true;

    var toggle = document.getElementById("study-plan-mobile-toggle");
    var card = document.getElementById("study-plan-card");
    if (!toggle || !card) return;

    toggle.addEventListener("click", function () {
      if (!isMobileLayout()) return;
      var collapsed = card.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });

    window.addEventListener("resize", syncStudyPlanCollapse);
    syncStudyPlanCollapse();
  }

  function normalizeCurriculumTopic(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function buildCurriculumTopicPool(startLevel, targetLevel) {
    var startIdx = Math.max(0, cefrIndex(startLevel));
    var targetIdx = Math.max(startIdx, cefrIndex(targetLevel));
    var pool = [];

    for (var i = startIdx; i <= targetIdx; i += 1) {
      var level = CEFR_LEVELS[i];
      var topics = PLACEHOLDER_CEFR_CURRICULUM[level] || [];
      topics.forEach(function (title) {
        pool.push({ level: level, title: title });
      });
    }

    if (!pool.length) {
      pool.push({ level: targetLevel || "B1", title: "Общая практика" });
    }
    return pool;
  }

  function buildPlaceholderCurriculum(goal, plan) {
    var weeks = Number(goal.target_duration_weeks || (plan && plan.weeks_total)) || 12;
    var latest = getLatestReport();
    var startLevel =
      goal.goal_start_cefr_level || (latest && latest.vocabulary_level) || "A1";
    var targetLevel = goal.target_cefr_level || "B2";
    var pool = buildCurriculumTopicPool(startLevel, targetLevel);
    var items = [];

    for (var w = 1; w <= weeks; w += 1) {
      var poolIdx = w - 1;
      var entry =
        poolIdx < pool.length ? pool[poolIdx] : pool[poolIdx % pool.length];
      items.push({
        classNum: w,
        title: entry.title,
        level: entry.level,
        lessonCompleted: false,
        selfStudyCompleted: false,
        completed: false,
        isCurrent: false,
      });
    }
    return items;
  }

  function collectCompletedLessonTopics(reports) {
    var seen = {};
    (reports || []).forEach(function (report) {
      var topic = formatLessonTopic(report);
      if (!topic || topic === "—") return;
      seen[normalizeCurriculumTopic(topic)] = true;
    });
    return seen;
  }

  function collectSelfPracticeDates(progressTracker) {
    if (!progressTracker || !progressTracker.days) return [];
    return progressTracker.days
      .filter(function (day) {
        return day.source === "self_practice" && day.completed;
      })
      .map(function (day) {
        return parseIsoDate(day.date);
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return a - b;
      });
  }

  function buildLessonMetaByTopic(reports) {
    var map = {};
    (reports || []).forEach(function (report) {
      var topic = formatLessonTopic(report);
      if (!topic || topic === "—") return;
      var key = normalizeCurriculumTopic(topic);
      var lessonDate = parseIsoDate(report.lesson_date || report.created_at);
      var existing = map[key];
      if (!existing || (lessonDate && (!existing.date || lessonDate > existing.date))) {
        map[key] = { reportId: report.id, date: lessonDate };
      }
    });
    return map;
  }

  function getCurriculumItems() {
    if (!hasGoal()) return [];
    return applyCurriculumCompletions(
      buildPlaceholderCurriculum(state.goal, state.studyPlan),
      state.reports,
      state.progressTracker
    );
  }

  function buildReportClassMap(items, reports) {
    var map = {};
    var usedClasses = {};

    items.forEach(function (item) {
      if (!item.lessonReportId) return;
      map[item.lessonReportId] = item.classNum;
      usedClasses[item.classNum] = true;
    });

    (reports || []).forEach(function (report) {
      if (map[report.id]) return;
      var topicKey = normalizeCurriculumTopic(formatLessonTopic(report));
      var match = null;
      items.forEach(function (item) {
        if (normalizeCurriculumTopic(item.title) !== topicKey) return;
        if (usedClasses[item.classNum] && map[report.id] !== item.classNum) return;
        if (!match || item.classNum > match) match = item.classNum;
      });
      if (match) {
        map[report.id] = match;
        usedClasses[match] = true;
      }
    });

    var unmappedReports = (reports || [])
      .filter(function (report) {
        return !map[report.id];
      })
      .sort(function (a, b) {
        return (
          new Date(a.lesson_date || a.created_at || 0) -
          new Date(b.lesson_date || b.created_at || 0)
        );
      });
    var availableClasses = items
      .filter(function (item) {
        return item.lessonCompleted && !usedClasses[item.classNum];
      })
      .sort(function (a, b) {
        return a.classNum - b.classNum;
      });

    unmappedReports.forEach(function (report, idx) {
      if (idx >= availableClasses.length) return;
      var classNum = availableClasses[idx].classNum;
      map[report.id] = classNum;
      usedClasses[classNum] = true;
    });

    return map;
  }

  function enrichCurriculumWithReportIds(items, reportClassMap) {
    var classToReport = {};
    Object.keys(reportClassMap || {}).forEach(function (reportId) {
      classToReport[reportClassMap[reportId]] = reportId;
    });
    items.forEach(function (item) {
      if (!item.lessonReportId && classToReport[item.classNum]) {
        item.lessonReportId = classToReport[item.classNum];
      }
    });
    return items;
  }

  function refreshCurriculumState() {
    if (!hasGoal()) {
      state.curriculumItems = [];
      state.reportClassMap = {};
      return;
    }
    var items = getCurriculumItems();
    state.reportClassMap = buildReportClassMap(items, state.reports);
    state.curriculumItems = enrichCurriculumWithReportIds(items, state.reportClassMap);
  }

  function findClassNumForReport(report) {
    if (!report) return null;
    return state.reportClassMap[report.id] || null;
  }

  function formatReportClassLabel(classNum) {
    if (!classNum) return "";
    return "Класс " + classNum;
  }

  function applyCurriculumCompletions(items, reports, progressTracker) {
    var completedTopics = collectCompletedLessonTopics(reports);
    var lessonMetaByTopic = buildLessonMetaByTopic(reports);
    var selfPracticeDates = collectSelfPracticeDates(progressTracker);
    var usedSelfPractice = {};

    items.forEach(function (item) {
      var key = normalizeCurriculumTopic(item.title);
      item.lessonCompleted = !!completedTopics[key];
      item.selfStudyCompleted = false;
      item.lessonReportId = null;
      item.lessonDateIso = null;

      if (item.lessonCompleted) {
        var meta = lessonMetaByTopic[key];
        if (meta) {
          item.lessonReportId = meta.reportId;
          item.lessonDateIso = meta.date ? isoDateOnly(meta.date) : null;
        }
        var lessonDate = meta ? meta.date : null;
        for (var i = 0; i < selfPracticeDates.length; i += 1) {
          var practiceDate = selfPracticeDates[i];
          var practiceKey = practiceDate.getTime();
          if (usedSelfPractice[practiceKey]) continue;
          if (lessonDate && practiceDate >= lessonDate) {
            item.selfStudyCompleted = true;
            usedSelfPractice[practiceKey] = true;
            break;
          }
        }
      }

      item.completed = item.lessonCompleted && item.selfStudyCompleted;
      item.hasProgress = item.lessonCompleted || item.selfStudyCompleted;
    });

    items.forEach(function (item) {
      var stub = state.curriculumStubProgress[item.classNum];
      if (!stub) return;
      if (stub.lesson) item.lessonCompleted = true;
      if (stub.selfStudy) item.selfStudyCompleted = true;
      item.completed = item.lessonCompleted && item.selfStudyCompleted;
      item.hasProgress = item.lessonCompleted || item.selfStudyCompleted;
    });

    applySequentialCurriculumBackfill(items);

    var currentIdx = -1;
    for (var j = 0; j < items.length; j += 1) {
      if (!items[j].lessonCompleted || !items[j].selfStudyCompleted) {
        currentIdx = j;
        break;
      }
    }
    if (currentIdx < 0 && items.length) currentIdx = items.length - 1;
    items.forEach(function (item, idx) {
      item.isCurrent = idx === currentIdx;
    });
    return items;
  }

  /** If Class N has a completed lesson, mark 1…N−1 as done (sequential program). */
  function applySequentialCurriculumBackfill(items) {
    var anchorItem = null;
    items.forEach(function (item) {
      if (item.lessonCompleted && (!anchorItem || item.classNum > anchorItem.classNum)) {
        anchorItem = item;
      }
    });
    if (!anchorItem || anchorItem.classNum <= 1) return;

    var anchorDate = parseIsoDate(anchorItem.lessonDateIso) || new Date();
    anchorDate.setHours(0, 0, 0, 0);

    items.forEach(function (item) {
      if (item.classNum >= anchorItem.classNum) return;
      item.lessonCompleted = true;
      item.selfStudyCompleted = true;
      item.completed = true;
      item.hasProgress = true;
      if (!item.lessonReportId) {
        var weeksBefore = anchorItem.classNum - item.classNum;
        var lessonDate = new Date(anchorDate);
        lessonDate.setDate(lessonDate.getDate() - weeksBefore * 7);
        item.lessonDateIso = isoDateOnly(lessonDate);
      }
    });
  }

  function getClassRowPhase(item) {
    if (item.isCurrent) return "current";
    if (item.lessonCompleted || item.selfStudyCompleted) return "passed";
    return "future";
  }

  function classActionCalendarIcon() {
    return (
      '<svg class="class-action-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<rect x="2.5" y="3.5" width="11" height="10" rx="1.25" fill="none" stroke="currentColor" stroke-width="1.25"/>' +
      '<path d="M5 2.5v2M11 2.5v2M2.5 6.5h11" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function classActionBookIcon() {
    return (
      '<svg class="class-action-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M2.75 3.25h4.5A1.25 1.25 0 018.5 4.5v9.25A1.25 1.25 0 017.25 12.5h-4.5V3.25z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>' +
      '<path d="M13.25 3.25H8.75A1.25 1.25 0 007.5 4.5v9.25a1.25 1.25 0 011.25-1.25h4.5V3.25z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function classActionCheckIcon() {
    return (
      '<svg class="class-action-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M4.5 8.25L7 10.75L11.75 5.75" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function renderCurriculumStatusPill(kind, done) {
    var label =
      kind === "selfStudy"
        ? done
          ? "Self-study готово"
          : "Self-study не выполнено"
        : done
          ? "Урок пройден"
          : "Урок не пройден";
    return (
      '<span class="curriculum-status-pill ' +
      (done ? "is-done" : "is-pending") +
      '">' +
      classActionCheckIcon() +
      '<span class="curriculum-status-text">' +
      esc(label) +
      "</span></span>"
    );
  }

  function curriculumReportArrow() {
    return '<span class="curriculum-status-arrow" aria-hidden="true">→</span>';
  }

  function renderCurriculumLessonStatus(item) {
    var done = item.lessonCompleted;
    var pendingLabel = "Урок не пройден";
    var doneLabel = "Урок пройден";
    var reportLabel = "Class summary";
    var className = "curriculum-status-pill " + (done ? "is-done" : "is-pending");

    if (done && item.lessonReportId) {
      var active = item.lessonReportId === state.selectedId ? " is-active" : "";
      return (
        '<button type="button" class="' +
        className +
        " curriculum-status-pill--report" +
        active +
        '" data-report-id="' +
        esc(item.lessonReportId) +
        '">' +
        classActionCheckIcon() +
        '<span class="curriculum-status-text">' +
        esc(reportLabel) +
        "</span>" +
        curriculumReportArrow() +
        "</button>"
      );
    }

    var label = done ? doneLabel : pendingLabel;
    return (
      '<span class="' +
      className +
      '">' +
      classActionCheckIcon() +
      '<span class="curriculum-status-text">' +
      esc(label) +
      "</span></span>"
    );
  }

  function renderCurriculumActionBtn(kind, classNum, topic, disabled) {
    var isBook = kind === "lesson";
    var label = isBook ? "Book Class" : "Self-study";
    var btnClass = isBook ? "class-action-btn--primary" : "class-action-btn--outline";
    var icon = isBook ? classActionCalendarIcon() : classActionBookIcon();
    return (
      '<button type="button" class="class-action-btn ' +
      btnClass +
      '" data-action="' +
      kind +
      '" data-class-num="' +
      classNum +
      '" data-topic="' +
      esc(topic) +
      '"' +
      (disabled ? " disabled" : "") +
      ">" +
      icon +
      "<span>" +
      label +
      "</span></button>"
    );
  }

  function renderCurriculumActions(item) {
    var phase = getClassRowPhase(item);
    var parts = [];

    if (phase === "passed") {
      parts.push(renderCurriculumLessonStatus(item));
      parts.push(renderCurriculumStatusPill("selfStudy", item.selfStudyCompleted));
      return (
        '<div class="curriculum-actions curriculum-actions--status">' + parts.join("") + "</div>"
      );
    }

    if (phase === "future") {
      return (
        '<div class="curriculum-actions curriculum-actions--buttons">' +
        renderCurriculumActionBtn("lesson", item.classNum, item.title, true) +
        renderCurriculumActionBtn("selfStudy", item.classNum, item.title, true) +
        "</div>"
      );
    }

    if (item.lessonCompleted) {
      parts.push(renderCurriculumLessonStatus(item));
    } else {
      parts.push(renderCurriculumActionBtn("lesson", item.classNum, item.title, false));
    }
    if (item.selfStudyCompleted) {
      parts.push(renderCurriculumStatusPill("selfStudy", true));
    } else {
      parts.push(renderCurriculumActionBtn("selfStudy", item.classNum, item.title, false));
    }
    return (
      '<div class="curriculum-actions curriculum-actions--buttons curriculum-actions--mixed">' +
      parts.join("") +
      "</div>"
    );
  }

  function filterCurriculumItems(items, filter) {
    if (filter === "completed") {
      return items.filter(function (item) {
        return item.hasProgress;
      });
    }
    if (filter === "upcoming") {
      return items.filter(function (item) {
        return !item.lessonCompleted && !item.selfStudyCompleted;
      });
    }
    return items;
  }

  function sortCurriculumForDisplay(items) {
    if (!items.length) return items;

    var currentItem = null;
    var rest = [];
    items.forEach(function (item) {
      if (item.isCurrent) currentItem = item;
      else rest.push(item);
    });

    rest.sort(function (a, b) {
      return a.classNum - b.classNum;
    });

    if (!currentItem) return rest;

    var currentNum = currentItem.classNum;
    var future = rest.filter(function (item) {
      return item.classNum > currentNum;
    });
    var passed = rest.filter(function (item) {
      return item.classNum < currentNum;
    });

    return [currentItem].concat(future).concat(passed);
  }

  function sortCurriculumSequential(items) {
    return items.slice().sort(function (a, b) {
      return a.classNum - b.classNum;
    });
  }

  function scrollCurriculumToCurrent(scrollEl, listEl) {
    if (!scrollEl || !listEl) return;

    function applyScroll() {
      var currentEl = listEl.querySelector(".curriculum-item.is-current");
      if (!currentEl) {
        scrollEl.scrollTop = 0;
        return;
      }
      var nextTop =
        currentEl.getBoundingClientRect().top -
        scrollEl.getBoundingClientRect().top +
        scrollEl.scrollTop;
      scrollEl.scrollTop = Math.max(0, Math.round(nextTop));
    }

    requestAnimationFrame(function () {
      applyScroll();
      requestAnimationFrame(applyScroll);
    });
    window.setTimeout(applyScroll, 280);
  }

  function renderCurriculumItemHtml(item) {
    var phase = getClassRowPhase(item);
    var phaseClass =
      phase === "passed" ? "is-passed" : phase === "current" ? "is-current" : "is-future";
    return (
      '<li class="curriculum-item ' +
      phaseClass +
      '">' +
      '<div class="curriculum-item-body">' +
      '<span class="curriculum-class-num">' +
      esc(formatCurriculumClassLabel(item)) +
      "</span>" +
      '<span class="curriculum-topic">' +
      esc(item.title) +
      "</span>" +
      renderCurriculumActions(item) +
      "</div>" +
      "</li>"
    );
  }

  function bindCurriculumListInteractions(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll(".curriculum-status-pill--report").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectLesson(btn.dataset.reportId);
      });
    });
    rootEl.querySelectorAll(".class-action-btn:not([disabled])").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var classNum = Number(btn.dataset.classNum);
        var topic = btn.dataset.topic || "";
        if (btn.dataset.action === "lesson") {
          openBookClassStub(classNum, topic);
        } else {
          openSelfStudyStub(classNum, topic);
        }
      });
    });
  }

  function formatCurriculumClassLabel(item) {
    if (item.isCurrent) {
      return "Class " + item.classNum + " · Текущий";
    }
    var label = "Class " + item.classNum;
    if (item.lessonCompleted && item.lessonDateIso) {
      label += " · " + formatDateLocal(item.lessonDateIso);
    }
    return label;
  }

  function renderCurriculumProgram() {
    var section = document.getElementById("sidebar-curriculum-section");
    var listEl = document.getElementById("curriculum-list");
    var scrollEl = document.getElementById("curriculum-list-scroll");
    var summaryEl = document.getElementById("curriculum-summary");
    var progressFill = document.getElementById("curriculum-progress-fill");
    if (!section || !listEl) return;

    if (!hasGoal()) {
      section.hidden = true;
      listEl.innerHTML = "";
      return;
    }

    refreshCurriculumState();
    var items = state.curriculumItems;
    var completedCount = items.filter(function (item) {
      return item.completed;
    }).length;
    var progressPercent =
      items.length > 0 ? Math.min(100, Math.round((completedCount / items.length) * 100)) : 0;
    var filter = state.curriculumFilter || "all";
    var filteredItems = filterCurriculumItems(items, filter);

    section.hidden = false;
    if (summaryEl) {
      summaryEl.textContent =
        "Пройдено " + completedCount + " из " + items.length + " Class";
    }
    if (progressFill) {
      progressFill.style.width = progressPercent + "%";
    }
    var progressBar = document.getElementById("curriculum-progress");
    if (progressBar) {
      progressBar.setAttribute("aria-valuenow", String(progressPercent));
    }

    if (!filteredItems.length) {
      listEl.innerHTML =
        '<li class="curriculum-empty">Нет Class в этой категории</li>';
      if (scrollEl) scrollEl.scrollTop = 0;
      return;
    }

    var visibleItems =
      filter === "all"
        ? sortCurriculumSequential(filteredItems)
        : sortCurriculumForDisplay(filteredItems);

    listEl.innerHTML = visibleItems.map(renderCurriculumItemHtml).join("");
    bindCurriculumListInteractions(listEl);

    if (filter === "all") {
      scrollCurriculumToCurrent(scrollEl, listEl);
    } else if (scrollEl) {
      scrollEl.scrollTop = 0;
    }
  }

  function updateCurriculumReportLinks() {
    document.querySelectorAll(".curriculum-status-pill--report").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.reportId === state.selectedId);
    });
  }

  function markCurriculumStubProgress(classNum, patch) {
    state.curriculumStubProgress[classNum] = Object.assign(
      {},
      state.curriculumStubProgress[classNum] || {},
      patch
    );
    renderCurriculumProgram();
  }

  function openBookClassStub(classNum, topic) {
    state.curriculumStubPending = { classNum: classNum, topic: topic, action: "lesson" };
    setText("book-class-topic", topic);
    var overlay = document.getElementById("book-class-overlay");
    if (overlay) overlay.hidden = false;
  }

  function openSelfStudyStub(classNum, topic) {
    state.curriculumStubPending = { classNum: classNum, topic: topic, action: "selfStudy" };
    setText("self-study-topic", topic);
    setText(
      "self-study-material",
      "Материалы по теме «" +
        topic +
        "»: упражнения, карточки и задания появятся здесь после подключения библиотеки школы."
    );
    var overlay = document.getElementById("self-study-overlay");
    if (overlay) overlay.hidden = false;
  }

  function closeCurriculumStubOverlays() {
    ["book-class-overlay", "self-study-overlay"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    state.curriculumStubPending = null;
  }

  function initCurriculumActions() {
    if (state.curriculumActionsBound) return;
    state.curriculumActionsBound = true;

    function bindClose(id, handler) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener("click", handler || closeCurriculumStubOverlays);
    }

    bindClose("btn-book-class-close");
    bindClose("btn-book-class-cancel");
    bindClose("btn-self-study-close");
    bindClose("btn-self-study-cancel");

    var bookConfirm = document.getElementById("btn-book-class-confirm");
    if (bookConfirm) {
      bookConfirm.addEventListener("click", function () {
        var pending = state.curriculumStubPending;
        if (!pending || pending.action !== "lesson") return;
        // STUB: real booking flow will redirect to school scheduler and confirm via webhook.
        markCurriculumStubProgress(pending.classNum, { lesson: true });
        closeCurriculumStubOverlays();
      });
    }

    var selfConfirm = document.getElementById("btn-self-study-confirm");
    if (selfConfirm) {
      selfConfirm.addEventListener("click", function () {
        var pending = state.curriculumStubPending;
        if (!pending || pending.action !== "selfStudy") return;
        // STUB: real materials library will track completion via API.
        markCurriculumStubProgress(pending.classNum, { selfStudy: true });
        closeCurriculumStubOverlays();
      });
    }

    ["book-class-overlay", "self-study-overlay"].forEach(function (id) {
      var overlay = document.getElementById(id);
      if (overlay) {
        overlay.addEventListener("click", function (e) {
          if (e.target === overlay) closeCurriculumStubOverlays();
        });
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeCurriculumStubOverlays();
    });
  }

  function getIntensityConfig(key) {
    return key && INTENSITY_PRESETS[key] ? INTENSITY_PRESETS[key] : null;
  }

  function countCurriculumProgress(goal, plan, reports, progressTracker) {
    var items = applyCurriculumCompletions(
      buildPlaceholderCurriculum(goal, plan),
      reports || [],
      progressTracker
    );
    var completed = items.filter(function (item) {
      return item.lessonCompleted;
    }).length;
    return {
      total: items.length,
      completed: completed,
      remaining: Math.max(0, items.length - completed),
    };
  }

  function computeIntensityTargetDate(presetKey, goal, plan, reports) {
    var cfg = getIntensityConfig(presetKey);
    if (!cfg || !cfg.classesPerWeek) return null;

    var progress = countCurriculumProgress(goal, plan, reports, state.progressTracker);
    var remaining = progress.remaining;
    if (progress.total > 0 && remaining <= 0) {
      return todayIsoDate();
    }

    var weeksNeeded = remaining / cfg.classesPerWeek;
    var days = Math.max(1, Math.ceil(weeksNeeded * 7));
    var end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + days);
    return isoDateOnly(end);
  }

  function formatIntensityProjectionText(presetKey, goal, plan, reports) {
    if (!presetKey) return "";
    var dateIso = computeIntensityTargetDate(presetKey, goal, plan, reports);
    if (!dateIso) return "";
    return "При такой интенсивности — цель к " + formatDateLocal(dateIso);
  }

  function getSelectedIntensityFromContainer(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return null;
    var active = container.querySelector(".intensity-preset.is-active");
    return active ? active.dataset.intensity : null;
  }

  function setIntensitySelection(containerId, presetKey) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll(".intensity-preset, .segment-btn").forEach(function (btn) {
      var active = presetKey && btn.dataset.intensity === presetKey;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function goalDraftFromForm(form) {
    var weeks = Number(form.target_duration_weeks.value) || 12;
    var preset = getSelectedIntensityFromContainer("goal-intensity-presets");
    var cfg = getIntensityConfig(preset);
    return {
      target_cefr_level: form.target_cefr_level.value || state.goal.target_cefr_level,
      target_duration_weeks: weeks,
      goal_set_date: hasGoal() ? state.goal.goal_set_date : todayIsoDate(),
      goal_start_cefr_level: hasGoal()
        ? state.goal.goal_start_cefr_level
        : getLatestReport()
          ? getLatestReport().vocabulary_level
          : "A1",
      study_intensity_preset: preset,
      tutor_lessons_per_week: cfg ? cfg.tutorLessons : Number(form.tutor_lessons_per_week.value) || 2,
      tutor_lesson_minutes: Number(form.tutor_lesson_minutes.value) || 60,
      practice_days_per_week: cfg ? cfg.practiceDays : 6,
    };
  }

  function updateGoalFormIntensityPreview() {
    var form = document.getElementById("goal-form");
    var projection = document.getElementById("goal-intensity-projection");
    var tutorRow = document.getElementById("goal-tutor-row");
    if (!form) return;

    var preset = getSelectedIntensityFromContainer("goal-intensity-presets");
    if (tutorRow) tutorRow.classList.toggle("is-preset-driven", !!preset);

    if (!projection) return;
    if (!preset) {
      projection.hidden = true;
      projection.textContent = "";
      return;
    }

    var draft = goalDraftFromForm(form);
    projection.textContent = formatIntensityProjectionText(
      preset,
      draft,
      state.studyPlan,
      state.reports
    );
    projection.hidden = !projection.textContent;
  }

  function syncIntensityUi(scope) {
    var preset = hasGoal() ? state.goal.study_intensity_preset : null;
    if (scope === "goal" || scope === "all") {
      setIntensitySelection("goal-intensity-presets", preset);
      updateGoalFormIntensityPreview();
    }
    if (scope === "sidebar" || scope === "all") {
      setIntensitySelection("sidebar-intensity-presets", preset);
      var projection = document.getElementById("sidebar-intensity-projection");
      if (projection) {
        if (preset && hasGoal()) {
          projection.textContent = formatIntensityProjectionText(
            preset,
            state.goal,
            state.studyPlan,
            state.reports
          );
          projection.hidden = !projection.textContent;
        } else {
          projection.hidden = true;
          projection.textContent = "";
        }
      }
    }
    if (scope === "analytics" || scope === "all") {
      setIntensitySelection("analytics-intensity-presets", preset);
      var analyticsProjection = document.getElementById("analytics-intensity-projection");
      if (analyticsProjection) {
        if (preset && hasGoal()) {
          analyticsProjection.textContent = formatIntensityProjectionText(
            preset,
            state.goal,
            state.studyPlan,
            state.reports
          );
          analyticsProjection.hidden = !analyticsProjection.textContent;
        } else {
          analyticsProjection.hidden = true;
          analyticsProjection.textContent = "";
        }
      }
    }
  }

  function applyIntensityToGoalState(presetKey) {
    if (!hasGoal()) return;
    var cfg = getIntensityConfig(presetKey);
    state.goal.study_intensity_preset = presetKey || null;
    if (cfg) {
      state.goal.tutor_lessons_per_week = cfg.tutorLessons;
      state.goal.practice_days_per_week = cfg.practiceDays;
      state.goal.target_date = computeIntensityTargetDate(
        presetKey,
        state.goal,
        state.studyPlan,
        state.reports
      );
    } else if (state.goal.goal_set_date && state.goal.target_duration_weeks) {
      var end = parseIsoDate(state.goal.goal_set_date) || new Date();
      end.setDate(end.getDate() + Number(state.goal.target_duration_weeks) * 7);
      state.goal.target_date = isoDateOnly(end);
    }
    state.studyPlan = computeStudyPlanClient(state.goal, state.reports, state.errorTracking);
  }

  function buildGoalPatchPayload(overrides) {
    var goal = Object.assign({}, state.goal, overrides || {});
    var preset = goal.study_intensity_preset || null;
    var cfg = getIntensityConfig(preset);
    var payload = {
      goal_type: goal.goal_type || "general_level",
      target_cefr_level: goal.target_cefr_level,
      target_duration_weeks: goal.target_duration_weeks,
      goal_label: goal.goal_label || null,
      scenario_description:
        goal.goal_type === "scenario_based" ? goal.scenario_description || goal.goal_label : null,
      tutor_lessons_per_week: cfg ? cfg.tutorLessons : goal.tutor_lessons_per_week || 2,
      tutor_lesson_minutes: goal.tutor_lesson_minutes || 60,
      practice_days_per_week: cfg ? cfg.practiceDays : goal.practice_days_per_week || 6,
      study_intensity_preset: preset,
    };
    if (preset) {
      payload.target_date = computeIntensityTargetDate(
        preset,
        goal,
        state.studyPlan,
        state.reports
      );
    }
    return payload;
  }

  function saveIntensityFromSidebar(presetKey) {
    if (!hasGoal()) return;

    if (isDemo) {
      applyIntensityToGoalState(presetKey);
      renderStudentOverview();
      return;
    }

    applyIntensityToGoalState(presetKey);
    var payload = buildGoalPatchPayload({ study_intensity_preset: presetKey || null });

    fetch("/api/students/" + encodeURIComponent(STUDENT_ID) + "/goal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(body.detail || res.statusText);
          });
        }
        return res.json();
      })
      .then(function (data) {
        state.goal = {
          target_cefr_level: data.target_cefr_level || null,
          target_date: data.target_date || null,
          goal_label: data.goal_label || null,
          goal_set_date: data.goal_set_date || null,
          goal_type: data.goal_type || null,
          target_duration_weeks: data.target_duration_weeks || null,
          scenario_description: data.scenario_description || null,
          tutor_lessons_per_week: data.tutor_lessons_per_week || 2,
          tutor_lesson_minutes: data.tutor_lesson_minutes || 60,
          practice_days_per_week: data.practice_days_per_week || 6,
          study_intensity_preset: data.study_intensity_preset || null,
        };
        state.studyPlan = data.study_plan || null;
        state.progressTracker = data.progress_tracker || null;
        renderStudentOverview();
      })
      .catch(function () {
        renderStudentOverview();
      });
  }

  function initIntensityPickers() {
    if (state.intensityPickerBound) return;
    state.intensityPickerBound = true;

    function bindContainer(containerId, onChange) {
      var container = document.getElementById(containerId);
      if (!container) return;
      container.querySelectorAll(".intensity-preset").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.dataset.intensity;
          var current = getSelectedIntensityFromContainer(containerId);
          var next = current === key ? null : key;
          setIntensitySelection(containerId, next);
          onChange(next);
        });
      });
    }

    bindContainer("goal-intensity-presets", function () {
      updateGoalFormIntensityPreview();
    });

    bindContainer("sidebar-intensity-presets", function (presetKey) {
      saveIntensityFromSidebar(presetKey);
    });

    bindContainer("analytics-intensity-presets", function (presetKey) {
      saveIntensityFromSidebar(presetKey);
    });
  }

  function clampDurationWeeks(value) {
    var weeks = Number(value);
    if (!weeks || isNaN(weeks)) weeks = 12;
    return Math.min(DURATION_WEEKS_MAX, Math.max(DURATION_WEEKS_MIN, Math.round(weeks)));
  }

  function formatDurationSummary(weeks) {
    weeks = clampDurationWeeks(weeks);
    var months = Math.max(1, Math.round(weeks / 4));
    var end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + weeks * 7);
    return (
      "≈ " +
      months +
      " " +
      pluralize(months, "месяц", "месяца", "месяцев") +
      " · цель к " +
      formatDateLocal(isoDateOnly(end))
    );
  }

  function syncDurationPicker(weeks) {
    weeks = clampDurationWeeks(weeks);
    var input = document.getElementById("goal-weeks-input");
    var slider = document.getElementById("goal-weeks-slider");
    var summary = document.getElementById("goal-duration-summary");
    var presets = document.querySelectorAll(".duration-preset");

    if (input) input.value = String(weeks);
    if (slider) slider.value = String(weeks);
    presets.forEach(function (btn) {
      var presetWeeks = Number(btn.dataset.weeks);
      var active = presetWeeks === weeks;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (summary) summary.textContent = formatDurationSummary(weeks);
    updateGoalFormIntensityPreview();
  }

  function initDurationPicker() {
    if (state.durationPickerBound) return;
    state.durationPickerBound = true;

    var input = document.getElementById("goal-weeks-input");
    var slider = document.getElementById("goal-weeks-slider");
    var presets = document.querySelectorAll(".duration-preset");
    var steps = document.querySelectorAll(".duration-step");

    if (input) {
      input.addEventListener("input", function () {
        syncDurationPicker(input.value);
      });
      input.addEventListener("blur", function () {
        syncDurationPicker(input.value);
      });
    }

    if (slider) {
      slider.addEventListener("input", function () {
        syncDurationPicker(slider.value);
      });
    }

    presets.forEach(function (btn) {
      btn.addEventListener("click", function () {
        syncDurationPicker(btn.dataset.weeks);
      });
    });

    steps.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var delta = Number(btn.dataset.delta);
        var current = input ? Number(input.value) : 12;
        syncDurationPicker(current + delta);
      });
    });
  }

  function initGoalModal() {
    initDurationPicker();
    initIntensityPickers();
    if (state.goalModalBound) return;
    state.goalModalBound = true;

    var overlay = document.getElementById("goal-overlay");
    var form = document.getElementById("goal-form");
    var openCta = document.getElementById("btn-set-goal-cta");
    var editBtn = document.getElementById("btn-goal-edit");
    var analyticsEditBtn = document.getElementById("btn-analytics-goal-edit");
    var closeBtn = document.getElementById("btn-goal-close");
    var cancelBtn = document.getElementById("btn-goal-cancel");
    var scenarioField = document.getElementById("goal-scenario-field");

    if (openCta) openCta.addEventListener("click", openGoalModal);
    if (editBtn) editBtn.addEventListener("click", openGoalModal);
    if (analyticsEditBtn) analyticsEditBtn.addEventListener("click", openGoalModal);
    if (closeBtn) closeBtn.addEventListener("click", closeGoalModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeGoalModal);

    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeGoalModal();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay && !overlay.hidden) closeGoalModal();
    });

    if (form) {
      form.querySelectorAll('[name="goal_type"]').forEach(function (radio) {
        radio.addEventListener("change", function () {
          if (scenarioField) {
            scenarioField.hidden = radio.value !== "scenario_based" || !radio.checked;
          }
        });
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        saveGoal(form);
      });
    }
  }

  function syncGoalTypeFields(form) {
    var goalType = form.querySelector('[name="goal_type"]:checked');
    var scenarioField = document.getElementById("goal-scenario-field");
    var isScenario = goalType && goalType.value === "scenario_based";
    if (scenarioField) scenarioField.hidden = !isScenario;
  }

  function openGoalModal() {
    var overlay = document.getElementById("goal-overlay");
    var form = document.getElementById("goal-form");
    var errorEl = document.getElementById("goal-form-error");
    if (!overlay || !form) return;

    if (errorEl) errorEl.hidden = true;

    if (hasGoal()) {
      var gt = state.goal.goal_type || "general_level";
      var typeRadio = form.querySelector('[name="goal_type"][value="' + gt + '"]');
      if (typeRadio) typeRadio.checked = true;
      form.target_cefr_level.value = state.goal.target_cefr_level || "";
      form.target_duration_weeks.value = state.goal.target_duration_weeks || 12;
      form.tutor_lessons_per_week.value = state.goal.tutor_lessons_per_week || 2;
      form.tutor_lesson_minutes.value = state.goal.tutor_lesson_minutes || 60;
      form.goal_label.value = state.goal.goal_label || "";
      form.scenario_description.value = state.goal.scenario_description || "";
    } else {
      form.reset();
      var defaultType = form.querySelector('[name="goal_type"][value="general_level"]');
      if (defaultType) defaultType.checked = true;
    }

    syncGoalTypeFields(form);
    syncDurationPicker(
      hasGoal() ? state.goal.target_duration_weeks || 12 : Number(form.target_duration_weeks.value) || 12
    );
    setIntensitySelection(
      "goal-intensity-presets",
      hasGoal() ? state.goal.study_intensity_preset : null
    );
    updateGoalFormIntensityPreview();
    populateGoalCefrSelect(hasGoal() ? state.goal.target_cefr_level : "");
    overlay.hidden = false;
  }

  function closeGoalModal() {
    var overlay = document.getElementById("goal-overlay");
    if (overlay) overlay.hidden = true;
  }

  function saveGoal(form) {
    var errorEl = document.getElementById("goal-form-error");
    var saveBtn = document.getElementById("btn-goal-save");
    var goalTypeEl = form.querySelector('[name="goal_type"]:checked');
    var goalType = goalTypeEl ? goalTypeEl.value : "general_level";
    var cefr = form.target_cefr_level.value;
    var weeks = Number(form.target_duration_weeks.value);
    var label = (form.goal_label.value || "").trim();
    var scenario = (form.scenario_description.value || "").trim();
    var tutorLessons = Number(form.tutor_lessons_per_week.value);
    var tutorMinutes = Number(form.tutor_lesson_minutes.value);
    var intensity = getSelectedIntensityFromContainer("goal-intensity-presets");
    var intensityCfg = getIntensityConfig(intensity);

    if (!cefr || !weeks) {
      showGoalError("Выберите целевой уровень и срок в неделях.");
      return;
    }

    var cefrError = validateGoalCefrChoice(cefr);
    if (cefrError) {
      showGoalError(cefrError);
      return;
    }

    if (goalType === "scenario_based" && !scenario && !label) {
      showGoalError("Опишите прикладную цель (собеседование, переговоры и т.п.).");
      return;
    }

    var payload = {
      goal_type: goalType,
      target_cefr_level: cefr,
      target_duration_weeks: weeks,
      goal_label: label || scenario || null,
      scenario_description: goalType === "scenario_based" ? scenario || label : null,
      tutor_lessons_per_week: intensityCfg ? intensityCfg.tutorLessons : tutorLessons,
      tutor_lesson_minutes: tutorMinutes,
      practice_days_per_week: intensityCfg ? intensityCfg.practiceDays : 6,
      study_intensity_preset: intensity || null,
    };

    if (intensity) {
      var draftGoal = Object.assign({}, payload, {
        goal_set_date: hasGoal() ? state.goal.goal_set_date : todayIsoDate(),
        goal_start_cefr_level: hasGoal()
          ? state.goal.goal_start_cefr_level
          : getLatestReport()
            ? getLatestReport().vocabulary_level
            : "A1",
      });
      payload.target_date = computeIntensityTargetDate(
        intensity,
        draftGoal,
        state.studyPlan,
        state.reports
      );
    }

    if (isDemo) {
      var start = todayIsoDate();
      var endDate = new Date();
      if (payload.target_date) {
        endDate = parseIsoDate(payload.target_date) || endDate;
      } else {
        endDate.setDate(endDate.getDate() + weeks * 7);
      }
      state.goal = Object.assign({}, payload, {
        target_date: payload.target_date || isoDateOnly(endDate),
        goal_set_date: start,
        goal_start_cefr_level: getLatestReport() ? getLatestReport().vocabulary_level : "B1",
      });
      state.studyPlan = computeStudyPlanClient(state.goal, state.reports);
      renderStudentOverview();
      closeGoalModal();
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Сохранение…";
    }
    if (errorEl) errorEl.hidden = true;

    fetch("/api/students/" + encodeURIComponent(STUDENT_ID) + "/goal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            var detail = body.detail;
            if (Array.isArray(detail)) {
              throw new Error(detail.map(function (d) { return d.msg; }).join(" "));
            }
            throw new Error(detail || res.statusText);
          });
        }
        return res.json();
      })
      .then(function (data) {
        state.goal = {
          target_cefr_level: data.target_cefr_level || null,
          target_date: data.target_date || null,
          goal_label: data.goal_label || null,
          goal_set_date: data.goal_set_date || null,
          goal_type: data.goal_type || null,
          target_duration_weeks: data.target_duration_weeks || null,
          scenario_description: data.scenario_description || null,
          tutor_lessons_per_week: data.tutor_lessons_per_week || 2,
          tutor_lesson_minutes: data.tutor_lesson_minutes || 60,
          practice_days_per_week: data.practice_days_per_week || 6,
          study_intensity_preset: data.study_intensity_preset || null,
        };
        state.studyPlan = data.study_plan || null;
        state.progressTracker = data.progress_tracker || null;
        renderStudentOverview();
        closeGoalModal();
      })
      .catch(function (err) {
        showGoalError(err.message || "Не удалось сохранить цель.");
      })
      .finally(function () {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Сохранить цель";
        }
      });
  }

  function showGoalError(message) {
    var errorEl = document.getElementById("goal-form-error");
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function formatRemainingDaysShort(targetDateIso) {
    var target = parseIsoDate(targetDateIso);
    if (!target) return "";

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    var diffMs = target - today;
    var days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (days < 0) return "Срок прошёл";
    if (days === 0) return "Сегодня";

    return days + " " + pluralize(days, "день", "дня", "дней");
  }

  function formatRemainingTime(targetDateIso) {
    var target = parseIsoDate(targetDateIso);
    if (!target) return "";

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    var diffMs = target - today;
    var days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (days < 0) {
      return "Срок цели прошёл";
    }
    if (days === 0) {
      return "Последний день до дедлайна";
    }

    var dayPart =
      days +
      " " +
      pluralize(days, "день", "дня", "дней");

    return "до дедлайна: " + dayPart;
  }

  function todayIsoDate() {
    return isoDateOnly(new Date());
  }

  function tomorrowIsoDate() {
    var d = new Date();
    d.setDate(d.getDate() + 1);
    return isoDateOnly(d);
  }

  function isoDateOnly(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
    try {
      var d = new Date(value);
      if (isNaN(d.getTime())) return "";
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + day;
    } catch (e) {
      return "";
    }
  }

  function parseIsoDate(value) {
    var iso = isoDateOnly(value);
    if (!iso) return null;
    var parts = iso.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function renderLessonReport(report, isLatest) {
    if (!state.curriculumItems.length && hasGoal()) {
      refreshCurriculumState();
    }

    var lessonDate = report.lesson_date || report.created_at;
    var classNum = findClassNumForReport(report);
    var topic = formatLessonTopic(report);

    setText("dash-date-label", isLatest ? "Дата последнего урока" : "Дата урока");
    setText("dash-last-date", formatDate(lessonDate));
    setText("lesson-report-class", classNum ? formatReportClassLabel(classNum) : "Класс —");
    setText("lesson-report-topic", topic);
    var heading = document.getElementById("lesson-report-heading");
    if (heading) {
      var sep = heading.querySelector(".lesson-report-sep");
      if (sep) sep.hidden = !classNum || !topic || topic === "—";
    }

    renderGrammarList("grammar-list-current", report.grammar_errors);
    renderGrammarList("grammar-list-detailed", report.grammar_errors);
    renderStuckTopics(state.errorTracking);
    renderPrioritizedWeakTopics(
      report.prioritized_weak_topics ||
        buildPrioritizedWeakTopics(state.errorTracking || { stuck_patterns: [], new_patterns: [] }, report.weak_topics)
    );

    setBadge("badge-grammar-current", grammarBadge(report.grammar_errors), true);
    setBadge("badge-vocab-current", report.vocabulary_level || "—", false);
    setBadge("badge-fluency-current", formatScore(report.fluency_score), true);
    setBadge("badge-grammar-detailed", grammarBadge(report.grammar_errors), true);
    setBadge("badge-vocab-detailed", report.vocabulary_level || "—", false);
    setBadge("badge-fluency-detailed", formatScore(report.fluency_score), true);

    var vocabLive = document.getElementById("vocab-live");
    if (vocabLive) {
      vocabLive.hidden = isDemo;
      if (!isDemo) setText("vocab-level-live", report.vocabulary_level || "—");
    }

    var fluencyLive = document.getElementById("fluency-live");
    if (fluencyLive) {
      fluencyLive.hidden = isDemo;
      if (!isDemo) setText("fluency-score-live", formatScore(report.fluency_score));
    }

    renderList("plan-recommendations", report.recommendations, true);
    renderHighlightList(
      "highlight-strengths",
      null,
      "Скоро здесь появятся сильные стороны с урока."
    );
    renderHighlightList(
      "highlight-focus",
      report.weak_topics,
      "Слабых тем не выявлено — отличная работа!"
    );
    renderHighlightList(
      "highlight-practice",
      report.recommendations,
      "Рекомендации появятся после следующего разбора урока."
    );

    setText("summary-score-ring", formatScore(report.fluency_score));
    setText("summary-score-num", formatScore(report.fluency_score));
    setText("summary-text", buildSummaryText(state.studentName, report));
  }

  function updateLessonContextBar(report, isLatest) {
    var bar = document.getElementById("lesson-context-bar");
    var label = document.getElementById("lesson-context-label");
    if (!bar || !label) return;

    if (isLatest || !report) {
      bar.hidden = true;
      return;
    }

    var lessonDate = report.lesson_date || report.created_at;
    var classNum = findClassNumForReport(report);
    var classPart = classNum ? formatReportClassLabel(classNum) + " · " : "";
    label.textContent =
      "Просмотр отчёта · " + classPart + formatDate(lessonDate) + " — не последний";
    bar.hidden = false;
  }

  function buildSummaryText(name, report) {
    var who = name ? name.split(" ")[0] : "Студент";
    var parts = [
      who +
        " — уровень словаря " +
        (report.vocabulary_level || "—") +
        ", беглость " +
        formatScore(report.fluency_score) +
        "/10.",
    ];
    if (report.weak_topics && report.weak_topics.length) {
      parts.push(
        "Зоны роста: " + report.weak_topics.slice(0, 4).join(", ") + "."
      );
    }
    if (report.recommendations && report.recommendations.length) {
      parts.push(report.recommendations[0]);
    }
    return parts.join(" ");
  }

  function formatLessonTopic(report) {
    if (report.lesson_topic) return report.lesson_topic;
    var topics = report.weak_topics;
    if (!topics || !topics.length) return "—";
    if (topics.length === 1) return topics[0];
    return topics.slice(0, 2).join(" · ");
  }

  function grammarExplanation(error) {
    return String(error.explanation || "").trim();
  }

  function renderGrammarExplanation(text) {
    if (!text) return "";
    return '<div class="error-explanation" hidden>' + esc(text) + "</div>";
  }

  function renderGrammarToggle(hasExplanation) {
    if (!hasExplanation) return "";
    return (
      '<button type="button" class="error-explain-toggle" aria-expanded="false" aria-label="Показать пояснение">' +
      '<span class="error-chevron" aria-hidden="true">▼</span></button>'
    );
  }

  function patternBadgeHtml(item) {
    var status = item.pattern_status;
    var n = item.consecutive_lessons_count || 0;
    if (status === "stuck" && n >= STUCK_LESSONS_THRESHOLD) {
      return (
        '<span class="pattern-badge pattern-stuck">Повторяется ' +
        n +
        "-й " +
        pluralize(n, "урок", "урока", "уроков") +
        " подряд</span>"
      );
    }
    if (status === "new") {
      return '<span class="pattern-badge pattern-new">Впервые</span>';
    }
    if (status === "recurring" && n > 1) {
      return (
        '<span class="pattern-badge pattern-recurring">Было на ' +
        n +
        " " +
        pluralize(n, "уроке", "уроках", "уроках") +
        " подряд</span>"
      );
    }
    return "";
  }

  function renderGrammarList(id, errors) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!errors || !errors.length) {
      el.innerHTML = emptyMsg("Грамматических ошибок не зафиксировано.");
      return;
    }
    el.innerHTML = errors
      .map(function (e) {
        var said = esc(e.error || "");
        var correct = esc(e.correction || "");
        var explanation = grammarExplanation(e);
        var category = esc(e.category_label || categoryLabel(inferErrorCategory(e)));
        var badge = patternBadgeHtml(e);
        var meta =
          category || badge
            ? '<div class="error-meta">' +
              (category ? '<span class="error-category-chip">' + category + "</span>" : "") +
              badge +
              "</div>"
            : "";
        return (
          '<li class="error-item">' +
          meta +
          '<div class="error-row">' +
          (said ? '<span class="said">«' + said + '»</span>' : "") +
          (said && correct ? '<span class="arrow">→</span>' : "") +
          (correct ? '<span class="correct">«' + correct + '»</span>' : "") +
          renderGrammarToggle(explanation) +
          "</div>" +
          renderGrammarExplanation(explanation) +
          "</li>"
        );
      })
      .join("");
  }

  function renderStuckTopics(tracking) {
    var card = document.getElementById("stuck-patterns-card");
    var list = document.getElementById("stuck-topics-list");
    if (!card || !list) return;
    var topics = (tracking && tracking.stuck_topics) || [];
    if (!topics.length) {
      card.hidden = true;
      list.innerHTML = "";
      return;
    }
    card.hidden = false;
    list.innerHTML = topics
      .map(function (t) {
        return "<li>" + esc(t.message || t.label) + "</li>";
      })
      .join("");
  }

  function renderPrioritizedWeakTopics(items) {
    var el = document.getElementById("plan-weak-topics");
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = emptyMsg("Слабых тем не выявлено — отличная работа!");
      return;
    }
    el.innerHTML =
      "<ol>" +
      items
        .map(function (item) {
          var badge = "";
          if (item.priority === "stuck") {
            badge =
              '<span class="weak-topic-priority priority-stuck">' +
              item.consecutive_lessons_count +
              " " +
              pluralize(item.consecutive_lessons_count, "урок", "урока", "уроков") +
              " подряд</span>";
          } else if (item.priority === "new") {
            badge = '<span class="weak-topic-priority priority-new">Впервые</span>';
          }
          return (
            '<li class="weak-topic-item">' +
            badge +
            "<span>" +
            esc(item.text) +
            "</span></li>"
          );
        })
        .join("") +
      "</ol>";
  }

  function initGrammarToggles() {
    ["grammar-list-current", "grammar-list-detailed"].forEach(function (listId) {
      var list = document.getElementById(listId);
      if (!list || list.dataset.grammarBound) return;
      list.dataset.grammarBound = "1";
      list.addEventListener("click", function (e) {
        var btn = e.target.closest(".error-explain-toggle");
        if (!btn) return;
        var item = btn.closest(".error-item");
        if (!item) return;
        var panel = item.querySelector(".error-explanation");
        if (!panel) return;
        var expanded = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", expanded ? "false" : "true");
        panel.hidden = expanded;
        item.classList.toggle("is-open", !expanded);
      });
    });
  }

  function renderHighlightList(id, items, emptyText) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML =
        '<li class="highlight-empty">' +
        esc(emptyText || "Пока нет данных.") +
        "</li>";
      return;
    }
    el.innerHTML = items
      .map(function (item) {
        return "<li>" + esc(item) + "</li>";
      })
      .join("");
  }

  function renderList(id, items, ordered) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = "";
      return;
    }
    var lis = items
      .map(function (item) {
        return "<li>" + esc(item) + "</li>";
      })
      .join("");
    if (el.tagName === "UL" || el.tagName === "OL") {
      el.innerHTML = lis;
      return;
    }
    var tag = ordered ? "ol" : "ul";
    el.innerHTML = "<" + tag + ">" + lis + "</" + tag + ">";
  }

  function renderChart(reports) {
    var wrap = document.getElementById("chart-dynamic");
    if (!wrap || reports.length < 1) return;
    wrap.hidden = false;

    var scores = reports.map(function (r) {
      return Number(r.fluency_score) || 0;
    });
    var max = 10;
    var w = 520;
    var h = 150;
    var padX = 40;
    var padY = 20;
    var chartH = h - padY * 2;
    var step = reports.length > 1 ? w / (reports.length - 1) : 0;

    var points = scores.map(function (score, i) {
      var x = padX + step * i;
      var y = padY + chartH - (score / max) * chartH;
      return { x: x, y: y, score: score };
    });

    var line = points.map(function (p) { return p.x + "," + p.y; }).join(" ");
    var area =
      "M " +
      points[0].x +
      "," +
      points[0].y +
      " " +
      points
        .slice(1)
        .map(function (p) { return "L " + p.x + "," + p.y; })
        .join(" ") +
      " L " +
      points[points.length - 1].x +
      "," +
      (h - padY) +
      " L " +
      points[0].x +
      "," +
      (h - padY) +
      " Z";

    var labels = reports
      .map(function (r) {
        return "<span>" + formatDateShort(r.lesson_date || r.created_at) + "</span>";
      })
      .join("");

    var last = points[points.length - 1];
    wrap.innerHTML =
      '<svg class="chart-svg" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet" aria-label="График прогресса">' +
      '<defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#4f46e5" stop-opacity="0.3"/>' +
      '<stop offset="100%" stop-color="#4f46e5" stop-opacity="0"/>' +
      "</linearGradient></defs>" +
      '<line class="chart-grid-line" x1="40" y1="20" x2="560" y2="20"/>' +
      '<line class="chart-grid-line" x1="40" y1="65" x2="560" y2="65"/>' +
      '<line class="chart-grid-line" x1="40" y1="110" x2="560" y2="110"/>' +
      '<line class="chart-grid-line" x1="40" y1="155" x2="560" y2="155"/>' +
      '<path class="chart-area" d="' +
      area +
      '"/>' +
      (reports.length > 1
        ? '<polyline class="chart-line" points="' + line + '"/>'
        : "") +
      points
        .map(function (p, i) {
          var r = i === points.length - 1 ? 5 : 4;
          return (
            '<circle class="chart-dot" cx="' +
            p.x +
            '" cy="' +
            p.y +
            '" r="' +
            r +
            '"/>'
          );
        })
        .join("") +
      '<text x="' +
      last.x +
      '" y="' +
      (last.y - 12) +
      '" text-anchor="middle" fill="#4f46e5" font-size="13" font-weight="700" font-family="Inter,sans-serif">' +
      formatScore(last.score) +
      "</text></svg>" +
      '<div class="chart-labels">' +
      labels +
      "</div>";
  }

  function grammarBadge(errors) {
    var n = (errors || []).length;
    return n ? String(n) : "0";
  }

  function setBadge(id, value, numeric) {
    var el = document.getElementById(id);
    if (!el) return;
    var num = el.querySelector(".num");
    if (num) num.textContent = value;
    else el.textContent = value;
    if (numeric) {
      el.classList.remove("cefr-badge");
      el.removeAttribute("title");
    } else {
      el.classList.remove("amber", "green");
      el.classList.add("cefr-badge");
      el.title = CEFR_CAPTION;
    }
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function emptyMsg(text) {
    return '<li class="error-item" style="list-style:none"><span class="empty-msg">' + esc(text) + "</span></li>";
  }

  function initials(name) {
    if (!name) return "?";
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  }

  function formatScore(n) {
    var v = Number(n);
    if (isNaN(v)) return "—";
    return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "");
  }

  function average(nums) {
    if (!nums.length) return 0;
    return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
  }

  function pluralize(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (e) {
      return "—";
    }
  }

  function formatDateLocal(iso) {
    var d = parseIsoDate(iso);
    if (!d) return formatDate(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function formatDateShort(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      });
    } catch (e) {
      return "—";
    }
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
