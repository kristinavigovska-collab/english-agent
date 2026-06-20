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
  var DURATION_WEEKS_MIN = 1;
  var DURATION_WEEKS_MAX = 104;
  var STUCK_LESSONS_THRESHOLD = 3;
  var RESOLVED_ABSENCE_LESSONS = 2;
  var STUCK_LOAD_MULTIPLIER = 1.1;
  var STUCK_LOAD_MIN_CATEGORIES = 2;

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
    },
    studyPlan: null,
    progressTracker: null,
    demoPractice: {},
    errorTracking: null,
    goalModalBound: false,
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

  initGrammarToggles();
  initGoalModal();
  initPracticeTracker();

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      activateTab(tab.dataset.tab);
    });
  });

  initHistoryPanel();

  if (isDemo) {
    var loadingDemo = document.getElementById("dash-loading");
    if (loadingDemo) loadingDemo.hidden = true;
    state.reports = sortReports(DEMO_REPORTS);
    refreshErrorTracking();
    state.studentName = "Анна Петрова";
    state.goal = DEMO_GOAL;
    state.studyPlan = computeStudyPlanClient(DEMO_GOAL, state.reports, state.errorTracking);
    state.progressTracker = computeProgressTrackerClient(
      DEMO_GOAL,
      state.reports,
      state.studyPlan,
      state.demoPractice
    );
    renderStudentOverview();
    renderHistoryList();
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
      };
      state.studyPlan = data.study_plan || null;
      state.progressTracker = data.progress_tracker || null;
      state.errorTracking = data.error_tracking || null;
      renderStudentOverview();
      renderHistoryList();
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

  function initHistoryPanel() {
    if (state.historyBound) return;
    state.historyBound = true;

    var openBtn = document.getElementById("btn-lesson-history");
    var overlay = document.getElementById("lesson-history-overlay");
    var closeBtn = document.getElementById("btn-history-close");
    var latestBtn = document.getElementById("btn-lesson-latest");

    if (openBtn) {
      openBtn.addEventListener("click", function () {
        renderHistoryList();
        openHistoryPanel();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", closeHistoryPanel);
    }

    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeHistoryPanel();
      });
    }

    if (latestBtn) {
      latestBtn.addEventListener("click", function () {
        var latest = getLatestReport();
        if (latest) selectLesson(latest.id);
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeHistoryPanel();
    });
  }

  function openHistoryPanel() {
    var overlay = document.getElementById("lesson-history-overlay");
    if (overlay) overlay.hidden = false;
  }

  function closeHistoryPanel() {
    var overlay = document.getElementById("lesson-history-overlay");
    if (overlay) overlay.hidden = true;
  }

  function activateTab(target) {
    document.querySelectorAll(".tab").forEach(function (t) {
      var active = t.dataset.tab === target;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
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
    updateHistoryListSelection();

    if (options.switchTab !== false) {
      activateTab("current");
    }
    if (options.closeHistory) {
      closeHistoryPanel();
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
    renderStudentGoal();
    renderStudyPlan();
    renderProgressTracker();
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

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var goalStart = parseIsoDate(goal.goal_set_date) || today;
    var weeksElapsed = Math.max(0, Math.floor((today - goalStart) / (7 * 86400000)));
    var weeksRemaining = Math.max(1, durationWeeks - weeksElapsed);

    var hoursRemaining = remainingDistance * HOURS_PER_CEFR_LEVEL * typeCoeff;
    var hoursPerWeek = hoursRemaining / weeksRemaining;

    var tutorLessons = Number(goal.tutor_lessons_per_week || 2);
    var tutorMinutes = Number(goal.tutor_lesson_minutes || 60);
    var practiceDays = Number(goal.practice_days_per_week || 6);
    var tutorHours = tutorLessons * tutorMinutes / 60;
    var selfHours = Math.max(0, hoursPerWeek - tutorHours);
    var minutesPerDay = (hoursPerWeek / practiceDays) * 60;

    var reportsSince = sorted.filter(function (r) {
      var d = parseIsoDate(r.lesson_date || r.created_at);
      return d && d >= goalStart;
    });
    var tutorCompleted = reportsSince.length * tutorMinutes / 60;
    var timeProgress = Math.min(1, weeksElapsed / durationWeeks);
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
      weeks_total: durationWeeks,
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

  function renderStudentGoal() {
    var detailsEl = document.getElementById("goal-details");
    var ctaEl = document.getElementById("btn-set-goal-cta");
    var targetEl = document.getElementById("dash-cefr-target");
    var targetBlock = document.getElementById("cefr-target-block");

    if (!detailsEl || !ctaEl || !targetEl) return;

    if (hasGoal()) {
      targetEl.textContent = state.goal.target_cefr_level;
      if (targetBlock) targetBlock.classList.add("has-goal");

      setText("goal-deadline", "к " + formatDateLocal(state.goal.target_date));
      setText("goal-remaining", formatRemainingTime(state.goal.target_date));

      var labelEl = document.getElementById("goal-label-text");
      if (labelEl) {
        if (state.goal.goal_label) {
          labelEl.textContent = "«" + state.goal.goal_label + "»";
          labelEl.hidden = false;
        } else {
          labelEl.hidden = true;
        }
      }

      detailsEl.hidden = false;
      ctaEl.hidden = true;
    } else {
      targetEl.textContent = "—";
      if (targetBlock) targetBlock.classList.remove("has-goal");
      detailsEl.hidden = true;
      ctaEl.hidden = false;
    }
  }

  function renderStudyPlan() {
    var panel = document.getElementById("goal-progress-panel");
    var card = document.getElementById("study-plan-card");
    if (!panel || !card) return;

    var plan = state.studyPlan;
    if (!hasGoal() || !plan) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    setText("study-plan-title", "План на " + plan.weeks_total + " " + pluralize(plan.weeks_total, "неделю", "недели", "недель"));

    var badge = document.getElementById("plan-status-badge");
    if (badge) {
      badge.textContent = plan.status_message;
      badge.className = "plan-status-badge " + (plan.status || "on_track");
    }

    setText(
      "study-plan-headline",
      "Нужно " + formatHours(plan.hours_per_week) + " ч/нед (" + plan.minutes_per_day + " мин/день)"
    );
    setText(
      "study-plan-tutor",
      "Из них " + formatHours(plan.tutor_hours_per_week) + " ч — занятия с репетитором"
    );
    setText(
      "study-plan-self",
      formatHours(plan.self_study_hours_per_week) + " ч — самостоятельная практика"
    );
    setText(
      "study-plan-progress-text",
      "Пройдено " + formatHours(plan.hours_completed) + " из " + formatHours(plan.total_hours) + " ч"
    );
    setText(
      "study-plan-weeks-left",
      "Осталось " + plan.weeks_remaining + " " + pluralize(plan.weeks_remaining, "неделя", "недели", "недель")
    );

    var fill = document.getElementById("study-plan-progress-fill");
    if (fill) fill.style.width = Math.min(100, plan.progress_percent) + "%";

    setText("study-plan-disclaimer", plan.disclaimer || PLAN_DISCLAIMER);
  }

  function computeProgressTrackerClient(goal, reports, plan, demoPractice) {
    if (!goal || !plan || !goal.goal_set_date) return null;

    var start = parseIsoDate(goal.goal_set_date);
    var weeks = Number(goal.target_duration_weeks) || 12;
    var end = parseIsoDate(goal.target_date);
    if (!end && start) {
      end = new Date(start.getTime());
      end.setDate(end.getDate() + weeks * 7);
    }
    if (!start || !end) return null;

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var lessonDates = {};
    sortReports(reports).forEach(function (r) {
      var d = parseIsoDate(r.lesson_date || r.created_at);
      if (d && d >= start && d <= end) {
        lessonDates[isoDateOnly(d)] = Number(goal.tutor_lesson_minutes || 60);
      }
    });

    var days = [];
    var cursor = new Date(start.getTime());
    var index = 0;
    while (cursor <= end) {
      index += 1;
      var iso = isoDateOnly(cursor);
      var planned = Number(plan.minutes_per_day) || 0;
      var completed = false;
      var completedMinutes = null;
      var source = null;

      if (lessonDates[iso]) {
        completed = true;
        completedMinutes = lessonDates[iso];
        source = "lesson";
      } else if (demoPractice[iso]) {
        completed = true;
        completedMinutes = demoPractice[iso];
        source = "self_practice";
      }

      var stateName = "future";
      if (cursor <= today) {
        if (source === "lesson") stateName = "lesson";
        else if (completed && completedMinutes < planned) stateName = "partial";
        else if (completed) stateName = "completed";
        else stateName = "missed";
      }

      days.push({
        date: iso,
        day_index: index,
        planned_minutes: planned,
        completed: completed,
        completed_minutes: completedMinutes,
        source: source,
        state: stateName,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    var elapsed = days.filter(function (d) {
      return parseIsoDate(d.date) <= today && d.planned_minutes > 0;
    });
    var completedDays = elapsed.filter(function (d) { return d.completed; }).length;

    var streak = 0;
    var streakCursor = new Date(today.getTime());
    while (true) {
      var iso = isoDateOnly(streakCursor);
      var day = days.find(function (d) { return d.date === iso; });
      if (!day) break;
      if (!day.completed) {
        if (streak === 0 && streakCursor.getTime() === today.getTime()) {
          streakCursor.setDate(streakCursor.getDate() - 1);
          continue;
        }
        break;
      }
      streak += 1;
      streakCursor.setDate(streakCursor.getDate() - 1);
    }

    var recent = days.filter(function (d) {
      var dDate = parseIsoDate(d.date);
      var windowStart = new Date(today.getTime());
      windowStart.setDate(windowStart.getDate() - 13);
      return dDate >= windowStart && dDate <= today && d.planned_minutes > 0;
    });
    var rate = recent.length ? recent.filter(function (d) { return d.completed; }).length / recent.length : null;

    var todayIso = isoDateOnly(today);
    var todayHasLesson = !!lessonDates[todayIso];
    var todayCompleted = !!demoPractice[todayIso] || todayHasLesson;

    var weeksGrid = [];
    for (var i = 0; i < days.length; i += 7) {
      weeksGrid.push(days.slice(i, i + 7));
    }

    return {
      days: days,
      weeks: weeksGrid,
      completed_days: completedDays,
      planned_days_elapsed: elapsed.length,
      streak: streak,
      pace_warning:
        rate !== null && rate < 0.7
          ? "Темп ниже плана — выполнено " + Math.round(rate * 100) + "% дней за последние 14 дней"
          : null,
      can_mark_today: start <= today && today <= end && !todayCompleted && !todayHasLesson,
      today_planned_minutes: Number(plan.minutes_per_day) || 0,
      goal_start_date: isoDateOnly(start),
      goal_end_date: isoDateOnly(end),
    };
  }

  function renderProgressTracker() {
    var tracker = state.progressTracker;
    var grid = document.getElementById("tracker-grid");
    var card = document.getElementById("progress-tracker-card");
    if (!grid || !card) return;

    if (!hasGoal() || !tracker) {
      card.hidden = true;
      return;
    }

    card.hidden = false;
    setText(
      "tracker-summary-days",
      "Выполнено " + tracker.completed_days + " из " + tracker.planned_days_elapsed + " запланированных дней"
    );
    setText(
      "tracker-summary-streak",
      tracker.streak
        ? "Серия: " + tracker.streak + " " + pluralize(tracker.streak, "день", "дня", "дней") + " подряд"
        : "Серия: 0 дней"
    );

    var paceEl = document.getElementById("pace-warning");
    if (paceEl) {
      if (tracker.pace_warning) {
        paceEl.textContent = tracker.pace_warning;
        paceEl.hidden = false;
      } else {
        paceEl.hidden = true;
      }
    }

    grid.innerHTML = (tracker.weeks || [])
      .map(function (week) {
        return (
          '<div class="tracker-week-row">' +
          week
            .map(function (day) {
              var title =
                "День " +
                day.day_index +
                " · " +
                formatDateLocal(day.date) +
                (day.completed
                  ? " · " + (day.completed_minutes || day.planned_minutes) + " мин"
                  : "");
              return (
                '<button type="button" class="tracker-day ' +
                esc(day.state) +
                '" title="' +
                esc(title) +
                '" aria-label="' +
                esc(title) +
                '"></button>'
              );
            })
            .join("") +
          "</div>"
        );
      })
      .join("");

    var markBtn = document.getElementById("btn-mark-practice");
    var form = document.getElementById("practice-minutes-form");
    if (markBtn) markBtn.hidden = !tracker.can_mark_today;
    if (form) form.hidden = true;
  }

  function initPracticeTracker() {
    var markBtn = document.getElementById("btn-mark-practice");
    var saveBtn = document.getElementById("btn-save-practice");
    var cancelBtn = document.getElementById("btn-cancel-practice");
    var form = document.getElementById("practice-minutes-form");
    var input = document.getElementById("practice-minutes-input");

    if (markBtn) {
      markBtn.addEventListener("click", function () {
        if (!state.progressTracker) return;
        if (markBtn) markBtn.hidden = true;
        if (form) form.hidden = false;
        if (input) input.value = String(state.progressTracker.today_planned_minutes || 30);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        if (form) form.hidden = true;
        if (markBtn && state.progressTracker && state.progressTracker.can_mark_today) {
          markBtn.hidden = false;
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        var minutes = input ? Number(input.value) : 0;
        if (!minutes || minutes < 1) return;
        savePractice(minutes);
      });
    }
  }

  function savePractice(minutes) {
    if (isDemo) {
      var todayIso = todayIsoDate();
      state.demoPractice[todayIso] = minutes;
      state.progressTracker = computeProgressTrackerClient(
        state.goal,
        state.reports,
        state.studyPlan,
        state.demoPractice
      );
      state.studyPlan = computeStudyPlanClient(state.goal, state.reports);
      var form = document.getElementById("practice-minutes-form");
      if (form) form.hidden = true;
      renderStudyPlan();
      renderProgressTracker();
      return;
    }

    var saveBtn = document.getElementById("btn-save-practice");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Сохранение…";
    }

    fetch("/api/students/" + encodeURIComponent(STUDENT_ID) + "/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_minutes: minutes }),
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
        state.studyPlan = data.study_plan || null;
        state.progressTracker = data.progress_tracker || null;
        renderStudyPlan();
        renderProgressTracker();
      })
      .catch(function (err) {
        alert(err.message || "Не удалось сохранить практику");
      })
      .finally(function () {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Сохранить";
        }
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
    if (state.goalModalBound) return;
    state.goalModalBound = true;

    var overlay = document.getElementById("goal-overlay");
    var form = document.getElementById("goal-form");
    var openCta = document.getElementById("btn-set-goal-cta");
    var editBtn = document.getElementById("btn-goal-edit");
    var closeBtn = document.getElementById("btn-goal-close");
    var cancelBtn = document.getElementById("btn-goal-cancel");
    var scenarioField = document.getElementById("goal-scenario-field");

    if (openCta) openCta.addEventListener("click", openGoalModal);
    if (editBtn) editBtn.addEventListener("click", openGoalModal);
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

    if (!cefr || !weeks) {
      showGoalError("Выберите целевой уровень и срок в неделях.");
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
      tutor_lessons_per_week: tutorLessons,
      tutor_lesson_minutes: tutorMinutes,
      practice_days_per_week: 6,
    };

    if (isDemo) {
      var start = todayIsoDate();
      var endDate = new Date();
      endDate.setDate(endDate.getDate() + weeks * 7);
      state.goal = Object.assign({}, payload, {
        target_date: isoDateOnly(endDate),
        goal_set_date: start,
        goal_start_cefr_level: getLatestReport() ? getLatestReport().vocabulary_level : "B1",
      });
      state.studyPlan = computeStudyPlanClient(state.goal, state.reports);
      state.progressTracker = computeProgressTrackerClient(
        state.goal,
        state.reports,
        state.studyPlan,
        state.demoPractice
      );
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
      return "Последний день до цели";
    }

    var weeks = Math.floor(days / 7);
    var dayPart =
      days +
      " " +
      pluralize(days, "день", "дня", "дней");

    if (weeks >= 1) {
      return (
        "осталось " +
        dayPart +
        " (" +
        weeks +
        " " +
        pluralize(weeks, "неделя", "недели", "недель") +
        ")"
      );
    }
    return "осталось " + dayPart;
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
    var lessonDate = report.lesson_date || report.created_at;

    setText("dash-date-label", isLatest ? "Дата последнего урока" : "Дата урока");
    setText("dash-last-date", formatDate(lessonDate));
    setText("lesson-topic-current", formatLessonTopic(report));

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
    label.textContent =
      "Просмотр урока от " + formatDate(lessonDate) + " — не последний";
    bar.hidden = false;
  }

  function renderHistoryList() {
    var list = document.getElementById("lesson-history-list");
    if (!list) return;

    if (!state.reports.length) {
      list.innerHTML =
        '<li class="history-empty">Пока нет завершённых уроков с отчётами.</li>';
      return;
    }

    list.innerHTML = state.reports
      .map(function (report, index) {
        var lessonDate = report.lesson_date || report.created_at;
        var errors = (report.grammar_errors || []).length;
        var errorLabel =
          errors === 0
            ? "без ошибок"
            : errors + " " + pluralize(errors, "ошибка", "ошибки", "ошибок");
        var isLatest = index === 0;
        var active = report.id === state.selectedId ? " active" : "";

        return (
          '<li><button type="button" class="history-item' +
          active +
          '" data-report-id="' +
          esc(report.id) +
          '">' +
          '<div class="history-item-date">' +
          formatDate(lessonDate) +
          (isLatest ? ' <span style="color:var(--accent);font-size:0.75rem">· последний</span>' : "") +
          "</div>" +
          '<div class="history-item-meta">' +
          "<span>Беглость " +
          formatScore(report.fluency_score) +
          "/10</span>" +
          '<span class="cefr-tag" title="' +
          esc(CEFR_CAPTION) +
          '">' +
          esc(report.vocabulary_level || "—") +
          "</span>" +
          "<span>" +
          esc(errorLabel) +
          "</span>" +
          "</div>" +
          "</button></li>"
        );
      })
      .join("");

    list.querySelectorAll(".history-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectLesson(btn.dataset.reportId, { closeHistory: true });
      });
    });
  }

  function updateHistoryListSelection() {
    document.querySelectorAll(".history-item").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.reportId === state.selectedId);
    });
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
