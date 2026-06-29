(function () {
  var STUDENT_ID = window.STUDENT_ID || "";
  var isDemo =
    typeof DashboardApi !== "undefined"
      ? DashboardApi.isDemoStudentId(STUDENT_ID)
      : !STUDENT_ID ||
        STUDENT_ID === "__STUDENT_ID__" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          STUDENT_ID
        );

  var SIDEBAR_WIDTH_KEY = "sidebar_width";
  var SIDEBAR_WIDTH_DEFAULT = 360;
  var SIDEBAR_WIDTH_MIN = 360;
  var SIDEBAR_WIDTH_MAX = 480;
  var SIDEBAR_WIDTH_MAX_RATIO = 0.4;
  var GOAL_PLAN_COLLAPSED_KEY = "sidebar_goal_collapsed";
  var ACTIVITY_HEATMAP_WEEKS_DEFAULT = 16;
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

  function cfg(path, fallback) {
    return typeof DashboardApi !== "undefined"
      ? DashboardApi.cfg(path, fallback)
      : fallback;
  }

  function cefrLevels() {
    return cfg("cefr_levels", []);
  }

  function planDisclaimer() {
    return cfg("plan_disclaimer", "");
  }

  function planDisclaimerShort() {
    return cfg("plan_disclaimer_short", "");
  }

  function stuckThresholdLessons() {
    return cfg("stuck_threshold_lessons", 3);
  }

  function durationWeeksMin() {
    return cfg("duration_weeks_min", 1);
  }

  function durationWeeksMax() {
    return cfg("duration_weeks_max", 104);
  }

  function activityHeatmapWeeks() {
    return cfg("activity_heatmap_weeks", ACTIVITY_HEATMAP_WEEKS_DEFAULT);
  }

  function cefrCaption() {
    return cfg("cefr_caption", "Уровень CEFR (международная шкала A1–C2)");
  }

  // DEPRECATED (ADR-001): не использовать для сайдбара «Программа обучения».
  // Curriculum строится из каталога программ (API) через StudentLearningContext.
  // Оставлено временно для совместимости; будет удалено при подключении school API.
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

  var NAV_VIEW_KEY = "app_nav_view";
  var NAV_COLLAPSED_KEY = "app_nav_collapsed";
  var ENROLLED_PLAN_KEY = "enrolled_plan_id";
  var SUBSCRIPTION_STORAGE_KEY = "english_agent_subscription_v1";
  var FREE_PLAN_TRIAL_DAYS = 15;

  var state = {
    reports: [],
    studentName: "Студент",
    selectedId: null,
    historyBound: false,
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
    programCategory: "general",
    programLevel: "all",
    programsFilterBound: false,
    programDetailId: null,
    subscriptionPlanId: "standard",
    learningContext: null,
    serverCurriculum: null,
    previewBundle: null,
    programCatalog: null,
    bookClassFlow: null,
  };

  var STUB_BOOKING_TEACHERS = [
    {
      id: "tutor-anna",
      name: "Anna K.",
      note: "General & Business · B2–C1",
      slots: ["Сегодня 18:00", "Завтра 10:30", "Завтра 19:00"],
    },
    {
      id: "tutor-james",
      name: "James R.",
      note: "IELTS & Interview prep",
      slots: ["Сегодня 17:00", "Завтра 12:00", "Пт 09:30"],
    },
    {
      id: "tutor-maria",
      name: "Maria S.",
      note: "Beginner – Intermediate",
      slots: ["Завтра 08:30", "Завтра 16:00", "Сб 11:00"],
    },
  ];

  var PROGRAM_LEVELS = {
    beginner: { id: "beginner", label: "Beginner", cefr: "A1", order: 1 },
    elementary: { id: "elementary", label: "Elementary", cefr: "A2", order: 2 },
    pre_intermediate: {
      id: "pre_intermediate",
      label: "Pre-Intermediate",
      cefr: "A2–B1",
      order: 3,
    },
    intermediate: { id: "intermediate", label: "Intermediate", cefr: "B1", order: 4 },
    upper_intermediate: {
      id: "upper_intermediate",
      label: "Upper-Intermediate",
      cefr: "B2",
      order: 5,
    },
    advanced: { id: "advanced", label: "Advanced", cefr: "C1", order: 6 },
  };

  var PROGRAM_CATEGORY_LABELS = {
    general: "General English",
    business: "Business English",
    special: "Special Program",
  };

  var PROGRAM_LEARNING_PLANS = [
    {
      id: "free_trial",
      name: "FREE TRIAL",
      cardTitle: "Try it free",
      priceMain: "€0",
      priceNote: "no card needed",
      features: [
        { text: "1 live class included", ok: true },
        { text: "7 days full access", ok: true },
        { text: "AI error analysis", ok: true },
        { text: "No auto-charge", ok: true },
      ],
      cta: "Start free →",
      ctaVariant: "free",
      accent: "free",
    },
    {
      id: "solo",
      name: "SOLO",
      cardTitle: "Practice",
      priceMain: "€20",
      priceNote: "per month",
      features: [
        { text: "yBook + program access", ok: true },
        { text: "AI Tutor for practice", ok: true },
        { text: "Goal & progress dashboard", ok: true },
        { text: "No live classes", ok: false },
      ],
      cta: "Subscribe",
      ctaVariant: "dark",
    },
    {
      id: "light",
      name: "LIGHT",
      cardTitle: "4 classes / mo",
      priceMain: "€88",
      priceNote: "per month",
      perClass: "€17 per class",
      features: [
        { text: "Everything in Solo", ok: true },
        { text: "4 × 30 min live classes", ok: true },
        { text: "AI analysis after each class", ok: true },
        { text: "1 class per week", ok: true },
      ],
      cta: "Subscribe",
      ctaVariant: "dark",
    },
    {
      id: "standard",
      name: "STANDARD",
      cardTitle: "8 classes / mo",
      priceMain: "€140",
      priceNote: "per month",
      perClass: "€15 per class",
      featured: true,
      badge: "Most popular",
      features: [
        { text: "Everything in Light", ok: true },
        { text: "8 × 30 min live classes", ok: true },
        { text: "2 classes per week", ok: true },
        { text: "Goal velocity forecast", ok: true },
      ],
      cta: "Subscribe",
      ctaVariant: "accent",
    },
    {
      id: "intensive",
      name: "INTENSIVE",
      cardTitle: "16 classes / mo",
      priceMain: "€236",
      priceNote: "per month",
      perClass: "€13.5 per class",
      features: [
        { text: "Everything in Standard", ok: true },
        { text: "16 × 30 min live classes", ok: true },
        { text: "4 classes per week", ok: true },
        { text: "Priority tutor matching", ok: true },
      ],
      cta: "Subscribe",
      ctaVariant: "dark",
    },
  ];

  var PLAN_PACKAGE_LABELS = {
    free_trial: "Пробный пакет",
    solo: "Solo",
    light: "Пакет Light",
    standard: "Пакет Стандарт",
    intensive: "Пакет Intensive",
  };

  var PLAN_LIVE_LESSONS_PER_MONTH = {
    free_trial: 1,
    solo: 0,
    light: 4,
    standard: 8,
    intensive: 16,
  };

  // STUB: replace with billing / usage API.
  var SIDEBAR_LESSON_PACKAGE_STUB = { used: 5, total: 8 };

  // Program catalog: GET /api/programs or static/demo-programs.json (preview).

  function getProgramCatalog() {
    return state.programCatalog || [];
  }

  function handleEnrollmentConfirmed() {
    state.curriculumStubProgress = {};
    rebuildStudentLearningContext();
    renderStudentOverview();
  }

  function goToProgramSelection(options) {
    options = options || {};
    setAppNavView("programs");
    if (options.programId) {
      openProgramDetail(options.programId);
    } else {
      closeProgramDetail();
    }
  }

  function readSubscription() {
    try {
      var raw = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function saveSubscription(sub) {
    try {
      localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(sub));
    } catch (err) {
      console.warn("[Subscription] Failed to persist:", err);
    }
  }

  function ensureSubscription() {
    var sub = readSubscription();
    if (!sub) {
      var end = new Date();
      end.setDate(end.getDate() + FREE_PLAN_TRIAL_DAYS);
      sub = {
        plan_id: "free_trial",
        plan_label: "Free plan",
        trial_ends_at: end.toISOString().slice(0, 10),
      };
      saveSubscription(sub);
    }
    if (!sub.trial_ends_at && sub.trial_days) {
      var started = parseIsoDate(sub.started_at) || new Date();
      var trialEnd = new Date(started.getTime());
      trialEnd.setDate(trialEnd.getDate() + Number(sub.trial_days));
      sub.trial_ends_at = trialEnd.toISOString().slice(0, 10);
      saveSubscription(sub);
    }
    return sub;
  }

  function subscriptionDaysLeft(sub) {
    if (!sub || !sub.trial_ends_at) return FREE_PLAN_TRIAL_DAYS;
    var end = parseIsoDate(sub.trial_ends_at);
    if (!end) return FREE_PLAN_TRIAL_DAYS;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000));
  }

  function renderNavPlanWidget() {
    var widget = document.getElementById("app-nav-plan-widget");
    var titleEl = document.getElementById("app-nav-plan-title");
    var leadEl = document.getElementById("app-nav-plan-lead");
    if (!widget || !titleEl || !leadEl) return;

    var sub = ensureSubscription();
    if (!sub || sub.plan_id !== "free_trial") {
      widget.hidden = true;
      return;
    }

    var daysLeft = subscriptionDaysLeft(sub);
    titleEl.innerHTML =
      "Free plan ends in <strong>" +
      daysLeft +
      " " +
      (daysLeft === 1 ? "day" : "days") +
      "</strong>";
    leadEl.textContent =
      "Upgrade to unlock live classes, full analytics, and your study program.";
    widget.hidden = false;
  }

  function initNavPlanWidget() {
    renderNavPlanWidget();
    var upgradeBtn = document.getElementById("btn-nav-upgrade-plan");
    if (upgradeBtn && !upgradeBtn.dataset.bound) {
      upgradeBtn.dataset.bound = "1";
      upgradeBtn.addEventListener("click", function () {
        state.programDetailId = null;
        setAppNavView("programs");
      });
    }
  }

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
        var view = btn.dataset.navView;
        if (view === "programs") {
          state.programDetailId = null;
        }
        setAppNavView(view);
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
    if (view !== "home" && view !== "analytics" && view !== "programs") {
      view = "home";
    }
    document.querySelectorAll(".app-nav-item").forEach(function (btn) {
      var active = btn.dataset.navView === view;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-current", active ? "page" : "false");
    });

    var homeView = document.getElementById("view-home");
    var analyticsView = document.getElementById("view-analytics");
    var programsView = document.getElementById("view-programs");
    if (homeView) homeView.hidden = view !== "home";
    if (analyticsView) analyticsView.hidden = view !== "analytics";
    if (programsView) programsView.hidden = view !== "programs";

    if (view === "programs") {
      updateProgramsViewMode();
      if (state.programDetailId) renderProgramDetailPage();
      else renderProgramsPage();
    }

    if (view === "analytics") {
      refreshAnalyticsPanels();
    }

    try {
      localStorage.setItem(NAV_VIEW_KEY, view);
    } catch (e) {
      /* ignore */
    }
  }
  window.setAppNavView = setAppNavView;

  function initLessonNavigation() {
    if (state.historyBound) return;
    state.historyBound = true;

    var latestBtn = document.getElementById("btn-lesson-latest");
    if (latestBtn) {
      latestBtn.addEventListener("click", function () {
        var primary = getPrimaryReport();
        if (primary) selectLesson(primary.id);
      });
    }
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
    if (root.id === "view-analytics") {
      refreshAnalyticsPanels();
    }
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

  function getMaxLessonCompletedClassNum(items) {
    var max = 0;
    (items || state.curriculumItems || []).forEach(function (item) {
      if (item.lessonCompleted && item.classNum > max) max = item.classNum;
    });
    return max;
  }

  function getReportIdForClass(classNum) {
    if (!classNum) return null;
    var fromCurriculum = null;
    (state.curriculumItems || []).forEach(function (item) {
      if (item.classNum === classNum && item.lessonReportId) {
        fromCurriculum = item.lessonReportId;
      }
    });
    if (fromCurriculum) return fromCurriculum;
    var map = state.reportClassMap || {};
    return (
      Object.keys(map).find(function (reportId) {
        return map[reportId] === classNum;
      }) || null
    );
  }

  /** Отчёт последнего пройденного Class в программе (разбор AI-тютора), не просто самый новый по дате. */
  function getPrimaryReport() {
    var maxClass = getMaxLessonCompletedClassNum(state.curriculumItems);
    if (maxClass > 0) {
      var reportId = getReportIdForClass(maxClass);
      if (reportId) {
        var report = state.reports.find(function (r) {
          return r.id === reportId;
        });
        if (report) return report;
      }
    }
    return getLatestReport();
  }

  function isPrimaryLessonReport(report) {
    if (!report) return false;
    var maxClass = getMaxLessonCompletedClassNum(state.curriculumItems);
    if (maxClass > 0) {
      return findClassNumForReport(report) === maxClass;
    }
    var latest = getLatestReport();
    return !!(latest && latest.id === report.id);
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
    var isPrimary = isPrimaryLessonReport(report);

    renderLessonReport(report, isPrimary);
    updateLessonContextBar(report, isPrimary);
    updateCurriculumReportLinks();

    if (options.switchTab !== false) {
      setAppNavView("home");
      activateTab("current", document.getElementById("view-home"));
    }
  }

  function renderStudentOverview() {
    var latest = getLatestReport();

    setText("dash-name", state.studentName);
    setText("dash-avatar", initials(state.studentName));
    setText("topbar-profile-avatar", initials(state.studentName));
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
    setText("dash-stat-cefr", latest ? latest.vocabulary_level || "—" : "—");
    renderSidebarProfilePrograms();
    renderStudentGoal();
    renderSidebarGoalCompact();
    renderSidebarLessonPackage();
    renderStudyPlan();
    renderCurriculumProgram();
    renderActivity();
    renderAnalyticsGoalPlan();
    renderProgramsPage();
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
    return cefrLevels().indexOf(String(level).toUpperCase());
  }

  function cefrScore(level, fluency) {
    var idx = cefrIndex(level);
    if (idx < 0) return null;
    if (fluency == null) return idx + 0.25;
    return idx + (Math.min(Math.max(Number(fluency), 0), 10) / 10) * 0.5;
  }

  function categoryLabel(catId) {
    var labels = cfg("error_category_labels", {}) || {};
    return labels[catId] || labels.other || catId;
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


  function hasGoalData(goal) {
    return !!(
      goal &&
      goal.target_cefr_level &&
      (goal.target_duration_weeks || goal.target_date)
    );
  }

  function needsAnalyticsPreview() {
    return !hasGoal() || !state.studyPlan || !state.progressTracker;
  }

  function hasLiveMetrics() {
    return hasGoal() && state.studyPlan && state.progressTracker;
  }

  function resolveMetricsContext() {
    if (hasLiveMetrics()) {
      return {
        goal: state.goal,
        studyPlan: state.studyPlan,
        progressTracker: state.progressTracker,
        reports: state.reports,
        isPreview: false,
      };
    }
    if (
      state.previewBundle &&
      state.previewBundle.study_plan &&
      state.previewBundle.progress_tracker &&
      typeof DashboardApi !== "undefined"
    ) {
      return {
        goal: DashboardApi.goalFieldsFromBundle(state.previewBundle),
        studyPlan: state.previewBundle.study_plan,
        progressTracker: state.previewBundle.progress_tracker,
        reports: state.previewBundle.reports || [],
        isPreview: true,
      };
    }
    return null;
  }

  function refreshAnalyticsPanels() {
    renderActivity();
    renderAnalyticsGoalPlan();
    renderStudyPlan();
    renderStudentGoal();
  }

  function ensurePreviewBundle() {
    if (state.previewBundle) {
      return Promise.resolve(state.previewBundle);
    }
    return DashboardApi.fetchPreviewBundle()
      .then(function (data) {
        state.previewBundle = data;
        return data;
      })
      .catch(function (err) {
        console.warn("[Preview] Failed to load preview dashboard:", err);
        return null;
      });
  }

  function setPreviewBanners(isPreview) {
    ["activity-preview-banner", "analytics-preview-banner"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = !isPreview;
    });
    var analyticsView = document.getElementById("view-analytics");
    if (analyticsView) analyticsView.classList.toggle("is-preview-mode", !!isPreview);
  }

  function loadPreviewBundleIfNeeded() {
    return ensurePreviewBundle().then(function () {
      var ctx = resolveMetricsContext();
      setPreviewBanners(!!ctx && ctx.isPreview);
    });
  }

  function reportChronoDate(report) {
    return parseIsoDate(report.lesson_date || report.created_at);
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
    if (idx < 0 || idx >= cefrLevels().length - 1) return null;
    return cefrLevels()[idx + 1];
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
      cefrLevels().forEach(function (level) {
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
      cefrLevels().forEach(function (level) {
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
    var practiceMinutes = 0;
    var practiceDays = 0;

    (tracker.days || []).forEach(function (day) {
      var dayDate = parseIsoDate(day.date);
      if (!dayDate || dayDate > today || !day.completed) return;
      var mins = day.completed_minutes || day.planned_minutes || 0;
      totalMinutes += mins;
      if (day.source === "lesson") {
        lessonMinutes += mins;
      } else if (day.source === "practice") {
        practiceMinutes += mins;
        practiceDays += 1;
      }
    });

    return {
      totalMinutes: totalMinutes,
      lessonMinutes: lessonMinutes,
      practiceMinutes: practiceMinutes,
      lessonCount: (reports || []).length,
      practiceDays: practiceDays,
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
      else if (day.source === "practice") agentMinutes = mins;
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

    var total = stats.lessonMinutes + stats.practiceMinutes;
    if (!total) {
      el.innerHTML = '<p class="activity-tile-detail">Пока нет данных о занятиях.</p>';
      return;
    }

    var lessonPct = Math.round((stats.lessonMinutes / total) * 100);
    var practicePct = 100 - lessonPct;

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
      barRow(practicePct, "Practice · " + stats.practiceMinutes + " мин", "practice");
  }

  function renderActivityHeatmap(container, tracker) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var endSunday = new Date(today);
    endSunday.setDate(endSunday.getDate() - endSunday.getDay());
    var startSunday = new Date(endSunday);
    startSunday.setDate(startSunday.getDate() - (activityHeatmapWeeks() - 1) * 7);

    var dayMap = buildActivityDayMap(tracker);
    var monthCells = ["<span></span>"];
    var monthSeen = {};
    var week;
    for (week = 0; week < activityHeatmapWeeks(); week += 1) {
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
      for (week = 0; week < activityHeatmapWeeks(); week += 1) {
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

    var ctx = resolveMetricsContext();
    if (!ctx) {
      setPreviewBanners(false);
      emptyEl.hidden = false;
      emptyEl.textContent =
        "Задайте цель обучения, чтобы видеть календарь активности и статистику занятий.";
      contentEl.hidden = true;
      return;
    }

    setPreviewBanners(ctx.isPreview);
    emptyEl.hidden = true;
    contentEl.hidden = false;

    var stats = buildActivityStats(ctx.progressTracker, ctx.reports);
    var planTotalMinutes =
      ctx.studyPlan && ctx.studyPlan.total_hours
        ? Math.round(ctx.studyPlan.total_hours * 60)
        : 0;
    var planPct =
      planTotalMinutes > 0
        ? Math.min(100, Math.round((stats.totalMinutes / planTotalMinutes) * 100))
        : 0;

    setText("activity-metric-minutes", String(stats.totalMinutes));
    setText("activity-metric-lessons", String(stats.lessonCount));
    setText("activity-metric-practice", String(stats.practiceDays));
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
    if (heatmapEl) renderActivityHeatmap(heatmapEl, ctx.progressTracker);
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

  function buildPaceVerdict(insights, plan, goal) {
    var goalRef = goal || state.goal;
    var levelPct = Math.round(insights.levelProgress * 100);
    var timePct = Math.round(insights.timeProgress * 100);
    var gap = levelPct - timePct;

    if (plan.status === "ahead" || gap >= 10) {
      return (
        "Вы опережаете график на ~" +
        Math.abs(gap) +
        "%. При сохранении темпа цель " +
        formatGoalShortLabel(goalRef) +
        " достижима раньше срока."
      );
    }
    if (plan.status === "behind" || gap <= -10) {
      return (
        "Вы отстаёте на ~" +
        Math.abs(gap) +
        "% от графика. Без дополнительных занятий цель к " +
        formatDateLocal(goalRef.target_date) +
        " под угрозой — прогресс теряется."
      );
    }
    return "Темп совпадает с планом — продолжайте в том же ритме, чтобы уложиться в дедлайн.";
  }

  function buildGoalPaceInsights(ctx) {
    ctx = ctx || resolveMetricsContext();
    if (!ctx || !hasGoalData(ctx.goal) || !ctx.studyPlan || !ctx.progressTracker) return null;

    var plan = ctx.studyPlan;
    var goal = ctx.goal;
    var tracker = ctx.progressTracker;
    var alerts = [];

    var inactiveStreak = countConsecutiveInactiveDays(tracker);
    var daysSinceVisit = daysSinceLastActivity(tracker);
    var weekMinutes = sumMinutesInLastDays(tracker, 7);
    var requiredWeekMinutes = Math.max(1, Math.round(plan.hours_per_week * 60));
    var minWeekThreshold = Math.round(requiredWeekMinutes * 0.55);

    var tutorExpected = Number(goal.tutor_lessons_per_week) || 2;
    var intensityCfg = getIntensityConfig(goal.study_intensity_preset);
    if (intensityCfg) tutorExpected = intensityCfg.tutorLessons;
    var lessonsThisWeek = countLessonsInCurrentWeek(ctx.reports);
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
        plan,
        goal
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

    var ctx = resolveMetricsContext();
    if (!ctx) {
      emptyEl.hidden = false;
      emptyEl.textContent =
        "Задайте цель обучения в профиле, чтобы видеть связь темпа занятий с достижением цели.";
      contentEl.hidden = true;
      renderGoalPaceAlerts([]);
      return;
    }

    setPreviewBanners(ctx.isPreview);
    emptyEl.hidden = true;
    contentEl.hidden = false;

    var plan = ctx.studyPlan;
    var goal = ctx.goal;
    var insights = buildGoalPaceInsights(ctx);
    if (!insights) {
      setText("analytics-goal-lead", formatAnalyticsGoalLead(goal));
      setText(
        "analytics-goal-target",
        goal.goal_type === "scenario_based" && goal.scenario_description
          ? goal.scenario_description
          : "Уровень " + (goal.target_cefr_level || "—")
      );
      setText("analytics-goal-deadline", "к " + formatDateLocal(goal.target_date));
      setText("analytics-goal-remaining", formatRemainingDaysShort(goal.target_date));
      renderGoalPaceAlerts([]);
      return;
    }

    renderGoalPaceAlerts(ctx.isPreview ? [] : insights.alerts);

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

    if (ctx.isPreview) {
      setIntensitySelection("analytics-intensity-presets", goal.study_intensity_preset || null);
      var analyticsProjection = document.getElementById("analytics-intensity-projection");
      if (analyticsProjection) {
        if (goal.study_intensity_preset) {
          analyticsProjection.textContent = formatIntensityProjectionText(
            goal.study_intensity_preset,
            goal,
            plan,
            ctx.reports
          );
          analyticsProjection.hidden = !analyticsProjection.textContent;
        } else {
          analyticsProjection.hidden = true;
          analyticsProjection.textContent = "";
        }
      }
    } else {
      syncIntensityUi("analytics");
    }

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
        formatHours(plan.practice_hours_per_week) +
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
      disclaimerEl.textContent = planDisclaimerShort();
      disclaimerEl.title = plan.disclaimer || planDisclaimer();
    }
  }

  function getProgramById(programId) {
    return getProgramCatalog().find(function (program) {
      return program.id === programId;
    }) || null;
  }

  function getProgramLevel(levelId) {
    return PROGRAM_LEVELS[levelId] || null;
  }

  function cefrToProgramLevel(cefr) {
    var level = String(cefr || "").toUpperCase();
    if (level === "A1") return "beginner";
    if (level === "A2") return "elementary";
    if (level === "B1") return "intermediate";
    if (level === "B2") return "upper_intermediate";
    if (level === "C1" || level === "C2") return "advanced";
    return null;
  }

  /** Активное зачисление из StudentLearningContext. */
  function getActiveEnrollment() {
    return state.learningContext && state.learningContext.enrollment
      ? state.learningContext.enrollment
      : null;
  }

  function getActiveProgramId() {
    var enrollment = getActiveEnrollment();
    return enrollment ? enrollment.program_id : null;
  }

  function readEnrolledPlanId() {
    try {
      return localStorage.getItem(ENROLLED_PLAN_KEY) || null;
    } catch (err) {
      return null;
    }
  }

  function saveEnrolledPlanId(planId) {
    try {
      if (planId) localStorage.setItem(ENROLLED_PLAN_KEY, planId);
      else localStorage.removeItem(ENROLLED_PLAN_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  function applyServerEnrollment(serverEnrollment) {
    if (!serverEnrollment || !serverEnrollment.program_id) return;
    if (typeof EnrollmentState === "undefined") return;

    var program = getProgramById(serverEnrollment.program_id);
    if (!program) return;

    EnrollmentState.enroll({
      program_id: serverEnrollment.program_id,
      level_id: serverEnrollment.level_id || program.levelId,
      level_cefr: serverEnrollment.level_cefr,
      level_name: serverEnrollment.level_name,
      plan_id: serverEnrollment.plan_id || null,
      enrolled_at: serverEnrollment.enrolled_at,
      student_confirmed: true,
      is_demo: false,
    });

    if (serverEnrollment.plan_id) {
      saveEnrolledPlanId(serverEnrollment.plan_id);
      state.subscriptionPlanId = serverEnrollment.plan_id;
    }
  }

  function enrollProgramLocally(programId, planId, isDemo) {
    var program = getProgramById(programId);
    if (!program || typeof EnrollmentState === "undefined") return false;

    var level = getProgramLevel(program.levelId);
    var ok = EnrollmentState.enroll({
      program_id: programId,
      level_id: program.levelId,
      level_cefr: level ? level.cefr : null,
      level_name: level ? level.label : program.levelId,
      plan_id: planId || null,
      student_confirmed: true,
      is_demo: isDemo !== false,
    });
    if (!ok) return false;

    saveEnrolledPlanId(planId);
    state.subscriptionPlanId = planId;
    return true;
  }

  function confirmProgramEnrollment(programId, planId) {
    if (!programId || !planId) {
      return Promise.reject(new Error("Program and plan are required"));
    }
    if (!getProgramById(programId)) {
      return Promise.reject(new Error("Program not found"));
    }

    var isLive =
      !DashboardApi.isStaticPreviewMode() &&
      !DashboardApi.isDemoStudentId(STUDENT_ID);

    function afterEnrollment() {
      handleEnrollmentConfirmed();
      if (state.programDetailId) renderProgramDetailPage();
      renderProgramsPage();
      setAppNavView("home");
    }

    if (!isLive) {
      if (!enrollProgramLocally(programId, planId, true)) {
        return Promise.reject(new Error("Enrollment failed"));
      }
      afterEnrollment();
      return Promise.resolve();
    }

    var status = planId === "free_trial" ? "trial" : "active";
    return DashboardApi.putStudentEnrollment(STUDENT_ID, {
      program_id: programId,
      plan_id: planId,
      status: status,
    })
      .then(function (payload) {
        if (payload && payload.enrollment) {
          applyServerEnrollment(payload.enrollment);
        } else if (!enrollProgramLocally(programId, planId, false)) {
          throw new Error("Enrollment failed");
        }
        return DashboardApi.fetchCurriculum(programId);
      })
      .then(function (curriculum) {
        if (curriculum) applyServerCurriculum(curriculum);
        afterEnrollment();
      });
  }

  function showProgramsCatalogError() {
    var banner = document.getElementById("dash-programs-error");
    if (banner) {
      banner.hidden = false;
      return;
    }
    var err = document.getElementById("dash-error");
    if (err) {
      err.hidden = false;
      err.textContent =
        "Не удалось загрузить каталог программ. Обновите страницу.";
    }
  }

  function loadProgramCatalogAndEnrollment() {
    var catalogPromise = DashboardApi.fetchProgramsCatalog()
      .then(function (programs) {
        if (!programs || !programs.length) {
          throw new Error("Empty program catalog");
        }
        state.programCatalog = programs;
        return programs;
      })
      .catch(function (err) {
        console.error("[Programs] Catalog load failed:", err);
        state.programCatalog = [];
        showProgramsCatalogError();
        return [];
      });

    var enrollmentPromise = Promise.resolve(null);
    if (
      !DashboardApi.isStaticPreviewMode() &&
      !DashboardApi.isDemoStudentId(STUDENT_ID)
    ) {
      enrollmentPromise = DashboardApi.fetchStudentEnrollment(STUDENT_ID)
        .then(function (payload) {
          return payload && payload.enrollment ? payload.enrollment : null;
        })
        .catch(function (err) {
          console.warn("[Enrollment] Server load failed, using localStorage:", err);
          return null;
        });
    }

    return Promise.all([catalogPromise, enrollmentPromise]).then(function (results) {
      state.programCatalog = results[0];
      if (typeof EnrollmentState !== "undefined") {
        EnrollmentState.init(state.programCatalog, PROGRAM_LEVELS);
      }
      if (results[1]) {
        applyServerEnrollment(results[1]);
      }
    });
  }

  /**
   * Единый канонический контекст дашборда (ADR-001, student-learning-context.js).
   * Вызывать после изменения goal, reports, studyPlan, enrollment.
   */
  function rebuildStudentLearningContext() {
    if (typeof EnglishAgentSLC === "undefined") {
      console.warn("[StudentLearningContext] EnglishAgentSLC module not loaded");
      return;
    }

    var enrollmentRecord =
      typeof EnrollmentState !== "undefined" && EnrollmentState.isEnrolled()
        ? EnrollmentState.getActive()
        : null;

    var activePlanId =
      (enrollmentRecord && enrollmentRecord.plan_id) ||
      readEnrolledPlanId() ||
      state.subscriptionPlanId;

    state.learningContext = EnglishAgentSLC.build({
      studentId: STUDENT_ID,
      goal: state.goal,
      studyPlan: state.studyPlan,
      reports: state.reports,
      progressTracker: state.progressTracker,
      programCatalog: getProgramCatalog(),
      programLevels: PROGRAM_LEVELS,
      enrollmentRecord: enrollmentRecord,
      enrolledPlanId: activePlanId,
      currentCefr: getCurrentStudentCefr(),
    });

    EnglishAgentSLC.validate(state.learningContext, {
      programCatalog: getProgramCatalog(),
    });

    refreshCurriculumState();

    EnglishAgentSLC.syncComputed(
      state.learningContext,
      state.curriculumItems,
      state.studyPlan,
      state.goal
    );
  }

  function getProgramsForCategory(category, levelFilter) {
    return getProgramCatalog().filter(function (program) {
      if (program.category !== category) return false;
      if (!levelFilter || levelFilter === "all") return true;
      if (program.category === "special") {
        return (
          program.levelId === levelFilter ||
          (program.base && program.base.levelId === levelFilter)
        );
      }
      return program.levelId === levelFilter;
    });
  }

  function getLevelOptionsForCategory(category) {
    var options = [{ id: "all", label: "Все уровни" }];
    var allowed = [];

    if (category === "general") {
      allowed = [
        "beginner",
        "elementary",
        "pre_intermediate",
        "intermediate",
        "upper_intermediate",
        "advanced",
      ];
    } else if (category === "business") {
      allowed = ["intermediate", "upper_intermediate", "advanced"];
    } else {
      var seen = { all: true };
      getProgramCatalog().filter(function (program) {
        return program.category === "special";
      }).forEach(function (program) {
        if (program.levelId && !seen[program.levelId]) {
          seen[program.levelId] = true;
          allowed.push(program.levelId);
        }
      });
      allowed.sort(function (a, b) {
        return (PROGRAM_LEVELS[a] ? PROGRAM_LEVELS[a].order : 0) -
          (PROGRAM_LEVELS[b] ? PROGRAM_LEVELS[b].order : 0);
      });
    }

    allowed.forEach(function (levelId) {
      var level = PROGRAM_LEVELS[levelId];
      if (!level) return;
      options.push({
        id: levelId,
        label: level.label + " · " + level.cefr,
      });
    });
    return options;
  }

  function formatProgramBaseLabel(base) {
    if (!base) return "";
    var categoryLabel = PROGRAM_CATEGORY_LABELS[base.category] || base.category;
    var level = PROGRAM_LEVELS[base.levelId];
    var levelLabel = level ? level.label : base.levelId;
    return categoryLabel + " · " + levelLabel;
  }

  function renderProgramsLevelChips() {
    var container = document.getElementById("programs-level-chips");
    if (!container) return;

    var options = getLevelOptionsForCategory(state.programCategory);
    if (
      state.programLevel !== "all" &&
      !options.some(function (option) {
        return option.id === state.programLevel;
      })
    ) {
      state.programLevel = "all";
    }

    container.innerHTML = options
      .map(function (option) {
        var active = option.id === state.programLevel;
        return (
          '<button type="button" class="programs-level-chip' +
          (active ? " is-active" : "") +
          '" data-program-level="' +
          esc(option.id) +
          '" aria-pressed="' +
          (active ? "true" : "false") +
          '">' +
          esc(option.label) +
          "</button>"
        );
      })
      .join("");
  }

  function renderProgramCard(program, enrolledRecord, mode) {
    var isHero = mode === "hero";
    var isEnrolledCurrent =
      enrolledRecord && enrolledRecord.program_id === program.id;
    var level = getProgramLevel(program.levelId);
    var isActive = isHero || isEnrolledCurrent;
    var cardClass =
      "program-card" + (isActive ? " is-active" : "");

    var enrolledBadge = "";
    if (isEnrolledCurrent && enrolledRecord) {
      enrolledBadge =
        '<span class="program-card-badge program-card-badge--active">Your program · ' +
        esc(enrolledRecord.level_cefr || level.cefr || "") +
        "</span>";
    }

    var badges =
      '<span class="program-card-badge program-card-badge--level">' +
      esc(level ? level.label : program.levelId) +
      "</span>" +
      (level
        ? '<span class="program-card-badge program-card-badge--cefr">' +
          esc(level.cefr) +
          "</span>"
        : "") +
      enrolledBadge;

    var baseHtml = "";
    if (program.base) {
      baseHtml =
        '<div class="program-card-base">' +
        '<span class="program-card-base-icon" aria-hidden="true">🔗</span>' +
        '<p class="program-card-base-text">Построено на базе <strong>' +
        esc(formatProgramBaseLabel(program.base)) +
        "</strong> — сначала освоите базовый трек или подтвердите уровень с преподавателем.</p>" +
        "</div>";
    }

    var tagsHtml = (program.tags || [])
      .map(function (tag) {
        return '<span class="program-card-tag">' + esc(tag) + "</span>";
      })
      .join("");

    var categoryLabel = esc(
      PROGRAM_CATEGORY_LABELS[program.category] || program.category
    );

    var actionHtml = isEnrolledCurrent
      ? '<button type="button" class="btn btn-primary program-continue-btn">Continue</button>'
      : '<button type="button" class="btn btn-primary program-enroll-btn" data-program-id="' +
        esc(program.id) +
        '">Get started</button>';

    return (
      '<article class="' +
      cardClass +
      '" data-program-id="' +
      esc(program.id) +
      '">' +
      '<div class="program-card-top">' +
      '<div class="program-card-badges">' +
      badges +
      "</div>" +
      '<span class="program-card-category">' +
      categoryLabel +
      "</span>" +
      "</div>" +
      "<h3 class=\"program-card-title\">" +
      esc(program.title) +
      "</h3>" +
      '<p class="program-card-desc">' +
      esc(program.description) +
      "</p>" +
      baseHtml +
      '<div class="program-card-meta">' +
      "<span>" +
      program.classes +
      " Class</span>" +
      "<span>~" +
      program.weeks +
      " " +
      pluralize(program.weeks, "неделя", "недели", "недель") +
      "</span>" +
      "</div>" +
      '<div class="program-card-tags">' +
      tagsHtml +
      "</div>" +
      '<div class="program-card-actions">' +
      actionHtml +
      '<button type="button" class="btn program-view-btn program-view-btn--secondary" data-program-id="' +
      esc(program.id) +
      '">View program</button>' +
      "</div>" +
      "</article>"
    );
  }

  function buildProgramCheckoutUrl(programId, planId) {
    return (
      "/checkout?plan=" +
      encodeURIComponent(planId) +
      "&program=" +
      encodeURIComponent(programId)
    );
  }

  function goToProgramCheckout(programId, planId) {
    window.location.href = buildProgramCheckoutUrl(programId, planId);
  }

  function renderPlanFeatureItem(item, isFeatured) {
    return (
      '<li class="program-plan-feature' +
      (item.ok ? "" : " program-plan-feature--muted") +
      '">' +
      '<span class="program-plan-feature-icon' +
      (item.ok
        ? isFeatured
          ? " program-plan-feature-icon--ok-featured"
          : " program-plan-feature-icon--ok"
        : " program-plan-feature-icon--no") +
      '" aria-hidden="true">' +
      (item.ok ? "✓" : "✕") +
      "</span>" +
      esc(item.text) +
      "</li>"
    );
  }

  function renderLearningPlanTile(programId, plan) {
    var cardClass = "program-plan-card";
    if (plan.featured) cardClass += " program-plan-card--featured";
    if (plan.accent === "free") cardClass += " program-plan-card--free";

    var ribbonHtml = plan.badge
      ? '<div class="program-plan-card-ribbon">' + esc(plan.badge) + "</div>"
      : "";

    var priceNoteHtml =
      '<p class="program-plan-card-price-note">' + esc(plan.priceNote) + "</p>";
    if (plan.perClass) {
      priceNoteHtml +=
        '<p class="program-plan-card-per-class">' + esc(plan.perClass) + "</p>";
    }

    var featuresHtml = (plan.features || [])
      .map(function (item) {
        return renderPlanFeatureItem(item, !!plan.featured);
      })
      .join("");

    var btnClass = "program-plan-card-btn program-plan-card-btn--" + (plan.ctaVariant || "dark");

    return (
      '<article class="' +
      cardClass +
      '">' +
      ribbonHtml +
      '<p class="program-plan-card-label">' +
      esc(plan.name) +
      "</p>" +
      "<h3 class=\"program-plan-card-title\">" +
      esc(plan.cardTitle) +
      "</h3>" +
      '<div class="program-plan-card-price">' +
      esc(plan.priceMain) +
      "</div>" +
      priceNoteHtml +
      '<ul class="program-plan-card-features">' +
      featuresHtml +
      "</ul>" +
      '<button type="button" class="' +
      btnClass +
      '" data-program-id="' +
      esc(programId) +
      '" data-plan-id="' +
      esc(plan.id) +
      '">' +
      esc(plan.cta) +
      "</button>" +
      "</article>"
    );
  }

  function renderProgramDetailPlansSection(program) {
    var plansHtml = PROGRAM_LEARNING_PLANS.map(function (plan) {
      return renderLearningPlanTile(program.id, plan);
    }).join("");

    return (
      '<section class="program-detail-plans" aria-labelledby="program-plans-title">' +
      '<header class="program-detail-plans-head">' +
      "<h2 class=\"program-detail-plans-title\" id=\"program-plans-title\">Choose your plan</h2>" +
      '<p class="program-detail-plans-lead">All plans include yBook + AI Tutor. Add live classes to progress faster.</p>' +
      "</header>" +
      '<div class="program-detail-plans-grid-wrap">' +
      '<div class="program-detail-plans-grid" role="list">' +
      plansHtml +
      "</div>" +
      "</div>" +
      '<ul class="program-detail-perks program-detail-perks--inline">' +
      "<li><span class=\"program-detail-perk-icon\" aria-hidden=\"true\">⏱</span>Micro class = 30 min focused session</li>" +
      "<li><span class=\"program-detail-perk-icon\" aria-hidden=\"true\">🤖</span>AI analyses errors after every live class</li>" +
      "<li><span class=\"program-detail-perk-icon\" aria-hidden=\"true\">📅</span>Unused classes roll over to next month</li>" +
      "</ul>" +
      '<p class="program-detail-plans-footnote">Prices in EUR. Cancel anytime.</p>' +
      "</section>"
    );
  }

  function buildProgramOverviewParagraphs(program) {
    var level = getProgramLevel(program.levelId);
    var categoryLabel = PROGRAM_CATEGORY_LABELS[program.category] || program.category;
    var paragraphs = [program.description];

    if (program.category === "general") {
      paragraphs.push(
        "Ступень линейной программы " +
          categoryLabel +
          " для уровня " +
          (level ? level.label + " (" + level.cefr + ")" : program.levelId) +
          ": говорение, аудирование, чтение и письмо в связной повседневной и учебной практике."
      );
    } else if (program.category === "business") {
      paragraphs.push(
        "Программа " +
          categoryLabel +
          " для уровня " +
          (level ? level.label : program.levelId) +
          " — переписка, созвоны, встречи и деловые ситуации в работе."
      );
    } else {
      paragraphs.push(
        "Специализированный курс с узким фокусом: вы тренируете конкретный навык поверх базовой программы English."
      );
    }

    if (program.base) {
      paragraphs.push(
        "Модуль опирается на " +
          formatProgramBaseLabel(program.base) +
          " — рекомендуем подтвердить базовый уровень с преподавателем перед стартом."
      );
    }

    return paragraphs;
  }

  function updateProgramsViewMode() {
    var catalog = document.getElementById("programs-catalog");
    var detail = document.getElementById("program-detail");
    var inDetail = !!state.programDetailId;
    if (catalog) catalog.hidden = inDetail;
    if (detail) detail.hidden = !inDetail;
  }

  function openProgramDetail(programId) {
    if (!getProgramById(programId)) return;
    state.programDetailId = programId;
    if (!state.subscriptionPlanId) state.subscriptionPlanId = "standard";
    updateProgramsViewMode();
    renderProgramDetailPage();
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      window.scrollTo(0, 0);
    }
  }

  function closeProgramDetail() {
    state.programDetailId = null;
    updateProgramsViewMode();
    renderProgramsPage();
  }

  function renderProgramDetailPage() {
    var container = document.getElementById("program-detail");
    if (!container || !state.programDetailId) return;

    var program = getProgramById(state.programDetailId);
    if (!program) {
      closeProgramDetail();
      return;
    }

    var level = getProgramLevel(program.levelId);
    var enrolledRecord =
      typeof EnrollmentState !== "undefined" && EnrollmentState.isEnrolled()
        ? EnrollmentState.getActive()
        : null;
    var isEnrolled =
      typeof EnrollmentState !== "undefined" &&
      EnrollmentState.list().some(function (item) {
        return item.program_id === program.id;
      });
    var overview = buildProgramOverviewParagraphs(program);
    var tagsHtml = (program.tags || [])
      .map(function (tag) {
        return '<span class="program-card-tag">' + esc(tag) + "</span>";
      })
      .join("");

    var baseHtml = "";
    if (program.base) {
      baseHtml =
        '<div class="program-detail-base">' +
        "🔗 Построено на базе <strong>" +
        esc(formatProgramBaseLabel(program.base)) +
        "</strong></div>";
    }

    container.innerHTML =
      '<div class="program-detail-layout">' +
      '<div class="program-detail-main">' +
      '<button type="button" class="program-detail-back" id="btn-program-detail-back">← Все программы</button>' +
      '<header class="program-detail-head">' +
      '<div class="program-detail-badges">' +
      '<span class="program-card-badge program-card-badge--level">' +
      esc(level ? level.label : program.levelId) +
      "</span>" +
      (level
        ? '<span class="program-card-badge program-card-badge--cefr">' +
          esc(level.cefr) +
          "</span>"
        : "") +
      (isEnrolled && enrolledRecord
        ? '<span class="program-card-badge program-card-badge--active">Your program · ' +
          esc(enrolledRecord.level_cefr || "") +
          "</span>"
        : "") +
      "</div>" +
      '<p class="program-detail-category">' +
      esc(PROGRAM_CATEGORY_LABELS[program.category] || program.category) +
      "</p>" +
      "<h1 class=\"program-detail-title\">" +
      esc(program.title) +
      "</h1>" +
      "</header>" +
      '<section class="program-detail-section" aria-labelledby="program-about-title">' +
      '<h2 class="program-detail-section-title" id="program-about-title">О курсе</h2>' +
      overview
        .map(function (paragraph) {
          return '<p class="program-detail-text">' + esc(paragraph) + "</p>";
        })
        .join("") +
      "</section>" +
      '<section class="program-detail-section" aria-labelledby="program-format-title">' +
      '<h2 class="program-detail-section-title" id="program-format-title">Формат обучения</h2>' +
      '<div class="program-detail-format">' +
      '<span class="program-detail-format-icon" aria-hidden="true">⏱</span>' +
      '<div class="program-detail-format-body">' +
      '<p class="program-detail-format-title">Ежедневный ритм программы</p>' +
      '<p class="program-detail-format-text">Программа рассчитана на <strong>30 минут практики</strong> на платформе и <strong>30 минут живого урока</strong> с преподавателем. Такой формат помогает закреплять материал самостоятельно и сразу отрабатывать его в разговоре.</p>' +
      "</div>" +
      "</div>" +
      "</section>" +
      '<section class="program-detail-section">' +
      '<h2 class="program-detail-section-title">Что входит</h2>' +
      '<div class="program-detail-meta">' +
      "<span>" +
      program.classes +
      " Class с преподавателем</span>" +
      "<span>~" +
      program.weeks +
      " " +
      pluralize(program.weeks, "неделя", "недели", "недель") +
      " программы</span>" +
      "<span>Practice + live каждый учебный день</span>" +
      "</div>" +
      (tagsHtml ? '<div class="program-detail-tags">' + tagsHtml + "</div>" : "") +
      baseHtml +
      "</section>" +
      '<div class="program-detail-enroll-cta">' +
      (isEnrolled
        ? '<button type="button" class="btn btn-primary program-continue-btn">Continue</button>'
        : '<button type="button" class="btn btn-primary program-enroll-btn" data-program-id="' +
          esc(program.id) +
          '">Get started</button>') +
      "</div>" +
      "</div>" +
      renderProgramDetailPlansSection(program) +
      "</div>";
  }

  function renderProgramsPage() {
    var grid = document.getElementById("programs-grid");
    var emptyEl = document.getElementById("programs-empty");
    var countEl = document.getElementById("programs-results-count");
    var hintEl = document.getElementById("programs-results-hint");
    var currentSection = document.getElementById("programs-current");
    if (!grid) return;

    renderProgramsLevelChips();

    document.querySelectorAll(".programs-category-tab").forEach(function (btn) {
      var active = btn.dataset.programCategory === state.programCategory;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    var enrolledRecord =
      typeof EnrollmentState !== "undefined" && EnrollmentState.isEnrolled()
        ? EnrollmentState.getActive()
        : null;
    var programs = getProgramsForCategory(state.programCategory, state.programLevel);

    if (countEl) {
      countEl.textContent =
        programs.length +
        " " +
        pluralize(programs.length, "программа", "программы", "программ");
    }

    if (hintEl) {
      if (state.programCategory === "special") {
        hintEl.textContent =
          "Special Programs включают модули поверх General или Business — смотрите блок «Построено на базе».";
        hintEl.hidden = false;
      } else if (state.programCategory === "business") {
        hintEl.textContent = "Business English доступен с уровня Intermediate.";
        hintEl.hidden = false;
      } else {
        hintEl.textContent =
          "General English — линейный путь из 6 уровней от Beginner до Advanced.";
        hintEl.hidden = false;
      }
    }

    if (emptyEl) emptyEl.hidden = programs.length > 0;
    grid.innerHTML = programs
      .map(function (program) {
        return renderProgramCard(program, enrolledRecord);
      })
      .join("");

    var enrolled =
      enrolledRecord && enrolledRecord.program_id
        ? getProgramById(enrolledRecord.program_id)
        : null;
    if (currentSection) {
      if (enrolled && enrolledRecord) {
        currentSection.hidden = false;
        currentSection.innerHTML = renderProgramCard(enrolled, enrolledRecord, "hero");
      } else {
        currentSection.hidden = true;
        currentSection.innerHTML = "";
      }
    }
  }

  function initProgramsPage() {
    if (state.programsFilterBound) return;
    state.programsFilterBound = true;

    document.querySelectorAll(".programs-category-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.programCategory = btn.dataset.programCategory || "general";
        state.programLevel = "all";
        renderProgramsPage();
      });
    });

    var levelContainer = document.getElementById("programs-level-chips");
    if (levelContainer) {
      levelContainer.addEventListener("click", function (event) {
        var chip = event.target.closest(".programs-level-chip");
        if (!chip) return;
        state.programLevel = chip.dataset.programLevel || "all";
        renderProgramsPage();
      });
    }

    var grid = document.getElementById("programs-grid");
    if (grid) {
      grid.addEventListener("click", function (event) {
        var enrollBtn = event.target.closest(".program-enroll-btn");
        if (enrollBtn) {
          event.stopPropagation();
          goToProgramSelection({ programId: enrollBtn.dataset.programId });
          return;
        }
        var continueBtn = event.target.closest(".program-continue-btn");
        if (continueBtn) {
          event.stopPropagation();
          setAppNavView("home");
          return;
        }
        var btn = event.target.closest(".program-view-btn");
        if (!btn) return;
        event.stopPropagation();
        var programId = btn.dataset.programId;
        if (!programId) return;
        openProgramDetail(programId);
      });
    }

    var currentSection = document.getElementById("programs-current");
    if (currentSection) {
      currentSection.addEventListener("click", function (event) {
        var enrollBtn = event.target.closest(".program-enroll-btn");
        if (enrollBtn) {
          goToProgramSelection({ programId: enrollBtn.dataset.programId });
          return;
        }
        var continueBtn = event.target.closest(".program-continue-btn");
        if (continueBtn) {
          setAppNavView("home");
        }
      });
    }

    var programsView = document.getElementById("view-programs");
    if (programsView) {
      programsView.addEventListener("click", function (event) {
        var enrollBtn = event.target.closest(".program-enroll-btn");
        if (enrollBtn) {
          goToProgramSelection({ programId: enrollBtn.dataset.programId });
          return;
        }

        if (event.target.closest(".program-continue-btn")) {
          setAppNavView("home");
          return;
        }

        if (event.target.closest(".program-view-btn")) {
          return;
        }

        if (event.target.closest("#btn-program-detail-back")) {
          closeProgramDetail();
          return;
        }

        if (event.target.closest(".program-plan-card-btn")) {
          var planBtn = event.target.closest(".program-plan-card-btn");
          var checkoutProgramId = planBtn.dataset.programId || state.programDetailId;
          var checkoutPlanId = planBtn.dataset.planId;
          if (!checkoutProgramId || !checkoutPlanId) return;
          planBtn.disabled = true;
          confirmProgramEnrollment(checkoutProgramId, checkoutPlanId)
            .catch(function (err) {
              console.error("[Enrollment] Failed to save enrollment:", err);
              window.alert(
                "Не удалось записаться на программу: " + (err.message || "ошибка")
              );
            })
            .finally(function () {
              planBtn.disabled = false;
            });
          return;
        }

        var card = event.target.closest(".program-card[data-program-id]");
        if (card) {
          openProgramDetail(card.dataset.programId);
        }
      });
    }
  }

  function formatSidebarPaceLabel(status) {
    if (status === "ahead") return "Опережаете план";
    if (status === "behind") return "Отстаёте";
    if (status === "on_track") return "По плану";
    return "—";
  }

  function pluralLessonsRu(n) {
    var abs = Math.abs(Number(n));
    var mod10 = abs % 10;
    var mod100 = abs % 100;
    if (mod10 === 1 && mod100 !== 11) return "урок";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "урока";
    return "уроков";
  }

  function shortenProgramLabel(programName) {
    if (!programName) return "Программа";
    return (programName.split("—").pop() || programName).trim();
  }

  function closeSidebarProgramMenu() {
    var menu = document.getElementById("sidebar-program-menu");
    var switchBtn = document.getElementById("btn-profile-program-switch");
    if (!menu) return;
    if (menu._closeTimer) {
      clearTimeout(menu._closeTimer);
      menu._closeTimer = null;
    }
    menu.classList.remove("is-open");
    if (switchBtn) switchBtn.setAttribute("aria-expanded", "false");
    menu._closeTimer = window.setTimeout(function () {
      if (!menu.classList.contains("is-open")) menu.hidden = true;
      menu._closeTimer = null;
    }, 180);
  }

  function openSidebarProgramMenu() {
    var menu = document.getElementById("sidebar-program-menu");
    var switchBtn = document.getElementById("btn-profile-program-switch");
    if (!menu) return;
    if (menu._closeTimer) {
      clearTimeout(menu._closeTimer);
      menu._closeTimer = null;
    }
    menu.hidden = false;
    window.requestAnimationFrame(function () {
      menu.classList.add("is-open");
    });
    if (switchBtn) switchBtn.setAttribute("aria-expanded", "true");
  }

  function switchActiveProgram(programId) {
    if (typeof EnrollmentState === "undefined") return;
    if (!EnrollmentState.setActive(programId)) return;

    var active = EnrollmentState.getActive();
    if (active && active.plan_id) {
      saveEnrolledPlanId(active.plan_id);
      state.subscriptionPlanId = active.plan_id;
    }

    state.serverCurriculum = null;
    state.curriculumItems = [];
    closeSidebarProgramMenu();
    rebuildStudentLearningContext();
    renderStudentOverview();
  }

  function renderSidebarProfilePrograms() {
    var nameEl = document.getElementById("dash-name");
    var pickBtn = document.getElementById("btn-pick-program");
    var labelEl = document.getElementById("sidebar-program-active");
    var actionsEl = document.getElementById("sidebar-program-actions");
    var switchBtn = document.getElementById("btn-profile-program-switch");
    var menuEl = document.getElementById("sidebar-program-menu");
    if (!labelEl || !actionsEl) return;

    var enrollments =
      typeof EnrollmentState !== "undefined" ? EnrollmentState.list() : [];
    var active = getActiveEnrollment();
    var count = enrollments.length;

    if (nameEl) {
      nameEl.textContent = count > 1 ? "Мой профиль" : state.studentName || "Студент";
    }

    if (switchBtn) switchBtn.hidden = count <= 1;

    if (menuEl) {
      if (count <= 1) {
        closeSidebarProgramMenu();
        menuEl.innerHTML = "";
        menuEl.hidden = true;
      } else {
        menuEl.innerHTML = enrollments
          .map(function (item) {
            var isActive = active && item.program_id === active.program_id;
            return (
              '<li class="sidebar-program-menu-item" role="presentation">' +
              '<button type="button" class="sidebar-program-menu-btn' +
              (isActive ? " is-active" : "") +
              '" role="option" data-program-id="' +
              esc(item.program_id) +
              '" aria-selected="' +
              (isActive ? "true" : "false") +
              '">' +
              esc(shortenProgramLabel(item.program_name)) +
              "</button></li>"
            );
          })
          .join("");
        menuEl.querySelectorAll(".sidebar-program-menu-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            switchActiveProgram(btn.dataset.programId);
          });
        });
      }
    }

    if (count === 0) {
      if (pickBtn) pickBtn.hidden = false;
      labelEl.hidden = true;
      actionsEl.hidden = true;
      syncSidebarProgramDependentSections(false);
      return;
    }

    if (pickBtn) pickBtn.hidden = true;
    labelEl.hidden = false;
    actionsEl.hidden = false;

    var programLabel = shortenProgramLabel(
      active && active.program_name ? active.program_name : "Программа"
    );
    labelEl.textContent = "Current Program: " + programLabel;
    labelEl.title = active && active.program_name ? active.program_name : programLabel;

    syncSidebarProgramDependentSections(true);
  }

  function syncSidebarProgramDependentSections(hasProgram) {
    var goalSection = document.getElementById("sidebar-goal-compact");
    var packageSection = document.getElementById("sidebar-lesson-package");
    var buyBtn = document.getElementById("btn-buy-lessons");
    if (goalSection) goalSection.hidden = !hasProgram;
    if (packageSection) packageSection.hidden = !hasProgram;
    if (buyBtn) buyBtn.hidden = !hasProgram;
  }

  function initSidebarProfilePrograms() {
    if (state.sidebarProfileProgramsBound) return;
    state.sidebarProfileProgramsBound = true;

    var pickBtn = document.getElementById("btn-pick-program");
    if (pickBtn) {
      pickBtn.addEventListener("click", function () {
        setAppNavView("programs");
      });
    }

    var addBtn = document.getElementById("btn-add-program");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        setAppNavView("programs");
      });
    }

    var switchBtn = document.getElementById("btn-profile-program-switch");
    if (switchBtn) {
      switchBtn.addEventListener("click", function () {
        var menu = document.getElementById("sidebar-program-menu");
        if (!menu) return;
        if (menu.classList.contains("is-open") && !menu.hidden) {
          closeSidebarProgramMenu();
          return;
        }
        openSidebarProgramMenu();
      });
    }

    document.addEventListener("click", function (e) {
      var menu = document.getElementById("sidebar-program-menu");
      var switchBtnEl = document.getElementById("btn-profile-program-switch");
      if (!menu || menu.hidden) return;
      if (menu.contains(e.target) || (switchBtnEl && switchBtnEl.contains(e.target))) {
        return;
      }
      closeSidebarProgramMenu();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSidebarProgramMenu();
    });
  }

  function renderSidebarGoalCompact() {
    var section = document.getElementById("sidebar-goal-compact");
    if (!getActiveEnrollment()) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;

    var currentEl = document.getElementById("sidebar-goal-current");
    var targetEl = document.getElementById("sidebar-goal-target");
    var captionEl = document.getElementById("sidebar-goal-compact-caption");
    var progressWrap = document.getElementById("sidebar-goal-compact-progress");
    var progressFill = document.getElementById("sidebar-goal-progress-fill");
    var progressPct = document.getElementById("sidebar-goal-progress-pct");
    var paceEl = document.getElementById("sidebar-goal-pace-status");
    var progressBar = document.getElementById("sidebar-goal-progress-bar");
    if (!currentEl || !targetEl) return;

    var latest = getLatestReport();
    var current = latest ? latest.vocabulary_level || "—" : "—";
    currentEl.textContent = current;

    var ctx = resolveMetricsContext();
    var previewGoal = ctx && ctx.isPreview ? ctx.goal : null;
    var goal = hasGoal() ? state.goal : previewGoal && hasGoalData(previewGoal) ? previewGoal : null;

    if (goal && goal.target_cefr_level) {
      targetEl.textContent = goal.target_cefr_level;
      if (captionEl) {
        var scenarioText = String(goal.scenario_description || "").trim();
        var isScenario = goal.goal_type === "scenario_based" && scenarioText;
        captionEl.textContent = isScenario ? "Потолок цели" : "Цель";
      }
    } else {
      targetEl.textContent = "—";
      if (captionEl) captionEl.textContent = "Цель";
    }

    var plan = ctx && ctx.studyPlan ? ctx.studyPlan : null;
    var computed =
      ctx && !ctx.isPreview && state.learningContext && state.learningContext.computed
        ? state.learningContext.computed
        : null;
    var showProgress = !!(goal && plan);

    if (progressWrap) progressWrap.hidden = !showProgress;
    if (!showProgress) return;

    var pct = Math.max(0, Math.min(100, Math.round(Number(plan.progress_percent) || 0)));
    var paceStatus = (computed && computed.pace_status) || plan.status || "on_track";

    if (progressFill) progressFill.style.width = pct + "%";
    if (progressBar) progressBar.setAttribute("aria-valuenow", String(pct));
    if (progressPct) progressPct.textContent = pct + "% пути";
    if (paceEl) {
      paceEl.textContent = formatSidebarPaceLabel(paceStatus);
      paceEl.className = "sidebar-goal-pace is-" + paceStatus;
    }
  }

  function renderSidebarLessonPackage() {
    var section = document.getElementById("sidebar-lesson-package");
    var nameEl = document.getElementById("lesson-package-name");
    var remainingEl = document.getElementById("lesson-package-remaining");
    var detailEl = document.getElementById("lesson-package-detail");
    var fillEl = document.getElementById("lesson-package-fill");
    var barEl = document.getElementById("lesson-package-progress-bar");
    if (!section) return;

    var enrollment = getActiveEnrollment();
    var planId =
      (enrollment && enrollment.plan_id) ||
      state.subscriptionPlanId ||
      "standard";
    var total =
      PLAN_LIVE_LESSONS_PER_MONTH[planId] != null
        ? PLAN_LIVE_LESSONS_PER_MONTH[planId]
        : SIDEBAR_LESSON_PACKAGE_STUB.total;

    if (!total) {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    // STUB: used count from billing later; demo uses fixed sample or lesson reports count.
    var used = SIDEBAR_LESSON_PACKAGE_STUB.used;
    if (total !== SIDEBAR_LESSON_PACKAGE_STUB.total) {
      used = Math.min(total, Math.max(0, state.reports.length));
    }
    used = Math.min(used, total);
    var remaining = Math.max(0, total - used);
    var pct = total > 0 ? Math.round((used / total) * 100) : 0;

    if (nameEl) {
      nameEl.textContent = PLAN_PACKAGE_LABELS[planId] || "Пакет";
    }
    if (remainingEl) {
      remainingEl.textContent = remaining + " " + pluralLessonsRu(remaining) + " осталось";
    }
    if (detailEl) {
      detailEl.textContent =
        used + " из " + total + " уроков с преподавателем использовано";
    }
    if (fillEl) fillEl.style.width = pct + "%";
    if (barEl) {
      barEl.setAttribute("aria-valuemax", String(total));
      barEl.setAttribute("aria-valuenow", String(used));
    }
  }

  function initBuyLessonsButton() {
    if (state.buyLessonsBound) return;
    state.buyLessonsBound = true;
    var btn = document.getElementById("btn-buy-lessons");
    if (!btn) return;
    btn.addEventListener("click", function () {
      // STUB: checkout / top-up flow — open Programs until billing is wired.
      setAppNavView("programs");
    });
  }

  function renderStudentGoal() {
    var detailsEl = document.getElementById("goal-details");
    var goalPlanSection = document.getElementById("sidebar-goal-plan-section");
    var descEl = document.getElementById("goal-info-desc");

    var ctx = resolveMetricsContext();
    var previewGoal = ctx && ctx.isPreview ? ctx.goal : null;

    if (hasGoal()) {
      var scenarioText = String(state.goal.scenario_description || "").trim();
      var isScenarioWithDescription =
        state.goal.goal_type === "scenario_based" && scenarioText;

      if (detailsEl) {
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
      }

      if (goalPlanSection) goalPlanSection.hidden = true;
    } else if (previewGoal && hasGoalData(previewGoal)) {
      var previewScenario = String(previewGoal.scenario_description || "").trim();
      var previewIsScenario =
        previewGoal.goal_type === "scenario_based" && previewScenario;

      if (detailsEl) {
        setText("goal-deadline", "к " + formatDateLocal(previewGoal.target_date));
        setText("goal-remaining", formatRemainingDaysShort(previewGoal.target_date));
        if (descEl) {
          if (previewIsScenario) {
            descEl.textContent =
              "Прикладная цель «" +
              previewScenario +
              "» — план не требует полного " +
              previewGoal.target_cefr_level;
          } else if (previewGoal.goal_label) {
            descEl.textContent = "«" + previewGoal.goal_label + "»";
          } else {
            descEl.textContent =
              "Достичь уровня " + (previewGoal.target_cefr_level || "—");
          }
        }
      }

      if (goalPlanSection) goalPlanSection.hidden = true;
    } else {
      if (detailsEl && descEl) descEl.textContent = "";
      if (goalPlanSection) goalPlanSection.hidden = true;
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
    var ctx = resolveMetricsContext();
    if (!ctx || !ctx.studyPlan || !hasGoalData(ctx.goal)) return null;
    var plan = ctx.studyPlan;
    var goal = ctx.goal;
    var computed =
      !ctx.isPreview && state.learningContext && state.learningContext.computed
        ? state.learningContext.computed
        : null;
    var date = formatGoalPlanDate(goal.target_date);
    var hours = formatHours(
      (computed && computed.hours_per_week_needed != null
        ? computed.hours_per_week_needed
        : plan.hours_per_week)
    ) + " ч/нед";
    var paceStatus =
      (computed && computed.pace_status) || plan.status || "on_track";
    return {
      expanded: date + " · " + hours + " · " + compactPlanStatusMessage({ status: paceStatus }),
      chipText: date + " · " + hours,
      chipBadge: shortPlanStatusMessage({ status: paceStatus }),
      chipBadgeClass: paceStatus,
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

  function hasGoalPlanUi() {
    var section = document.getElementById("sidebar-goal-plan-section");
    if (!section || section.hidden) return false;
    var ctx = resolveMetricsContext();
    return !!(ctx && ctx.studyPlan && hasGoalData(ctx.goal));
  }

  function syncGoalPlanCollapse() {
    var section = document.getElementById("sidebar-goal-plan-section");
    var toggle = document.getElementById("goal-plan-toggle");
    var expandedSummary = document.getElementById("goal-plan-summary-expanded");
    var chip = document.getElementById("goal-plan-collapsed-chip");
    var panel = document.getElementById("goal-plan-panel");
    var sidebar = document.querySelector(".sidebar");
    if (!section || !hasGoalPlanUi()) return;

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
    if (section) section.hidden = true;
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

    if (isMobileLayout() && hasGoalPlanUi()) {
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

  function collectCompletedLessonTopics(reports) {
    var seen = {};
    (reports || []).forEach(function (report) {
      var topic = formatLessonTopic(report);
      if (!topic || topic === "—") return;
      seen[normalizeCurriculumTopic(topic)] = true;
    });
    return seen;
  }

  function collectPracticeDates(progressTracker) {
    if (!progressTracker || !progressTracker.days) return [];
    return progressTracker.days
      .filter(function (day) {
        return day.source === "practice" && day.completed;
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

  function getCurriculumItemsFromContext() {
    var ctx = state.learningContext;
    if (!ctx || !ctx.curriculum || !ctx.curriculum.classes) return [];
    return ctx.curriculum.classes.map(function (item) {
      return Object.assign({}, item);
    });
  }

  function attachClassIndexToReports(reports, reportClassMap) {
    (reports || []).forEach(function (report) {
      var classNum = reportClassMap[report.id];
      report.class_index = classNum != null ? classNum - 1 : null;
      report.class_num = classNum != null ? classNum : null;
    });
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
        if (!item.lessonCompleted) return;
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
      if (!item.lessonCompleted) return;
      if (!item.lessonReportId && classToReport[item.classNum]) {
        item.lessonReportId = classToReport[item.classNum];
      }
    });
    return items;
  }

  function refreshCurriculumState() {
    var enrollment = getActiveEnrollment();
    if (!enrollment) {
      state.curriculumItems = [];
      state.reportClassMap = {};
      return;
    }

    if (state.serverCurriculum && state.serverCurriculum.program_id === enrollment.program_id) {
      applyServerCurriculum(state.serverCurriculum);
      return;
    }

    DashboardApi.fetchCurriculum(enrollment.program_id)
      .then(applyServerCurriculum)
      .catch(function (err) {
        console.warn("[Curriculum] fetch failed:", err);
        state.curriculumItems = [];
        state.reportClassMap = {};
      });
  }

  function findClassNumForReport(report) {
    if (!report) return null;
    if (report.class_num != null) return report.class_num;
    if (report.class_index != null) return report.class_index + 1;
    return state.reportClassMap[report.id] || null;
  }

  function formatReportClassLabel(classNum) {
    if (!classNum) return "";
    return "Класс " + classNum;
  }

  function applyCurriculumCompletions(items, reports, progressTracker) {
    var completedTopics = collectCompletedLessonTopics(reports);
    var lessonMetaByTopic = buildLessonMetaByTopic(reports);
    var practiceDates = collectPracticeDates(progressTracker);
    var usedSelfPractice = {};

    items.forEach(function (item) {
      var key = normalizeCurriculumTopic(item.title);
      item.lessonCompleted = !!completedTopics[key];
      item.practiceCompleted = false;
      item.lessonReportId = null;
      item.lessonDateIso = null;

      if (item.lessonCompleted) {
        var meta = lessonMetaByTopic[key];
        if (meta) {
          item.lessonReportId = meta.reportId;
          item.lessonDateIso = meta.date ? isoDateOnly(meta.date) : null;
        }
        var lessonDate = meta ? meta.date : null;
        for (var i = 0; i < practiceDates.length; i += 1) {
          var practiceDate = practiceDates[i];
          var practiceKey = practiceDate.getTime();
          if (usedSelfPractice[practiceKey]) continue;
          if (lessonDate && practiceDate >= lessonDate) {
            item.practiceCompleted = true;
            usedSelfPractice[practiceKey] = true;
            break;
          }
        }
      }

      item.completed = item.lessonCompleted && item.practiceCompleted;
      item.hasProgress = item.lessonCompleted || item.practiceCompleted;
    });

    items.forEach(function (item) {
      var stub = state.curriculumStubProgress[item.classNum];
      if (!stub) return;
      if (stub.lesson) item.lessonCompleted = true;
      if (stub.practice) item.practiceCompleted = true;
      item.completed = item.lessonCompleted && item.practiceCompleted;
      item.hasProgress = item.lessonCompleted || item.practiceCompleted;
    });

    applySequentialCurriculumBackfill(items);

    applyPracticeProgressFields(items);

    var currentIdx = -1;
    for (var j = 0; j < items.length; j += 1) {
      if (!items[j].lessonCompleted || !items[j].practiceCompleted) {
        currentIdx = j;
        break;
      }
    }
    if (currentIdx < 0 && items.length) currentIdx = items.length - 1;
    applyNextStepFlags(items);
    return items;
  }

  function getNextStepClassItem(items) {
    if (!items || !items.length) return null;
    var open = items.find(function (item) {
      return !item.completed;
    });
    return open || items[items.length - 1];
  }

  function applyNextStepFlags(items) {
    var nextItem = getNextStepClassItem(items);
    var currentNum = nextItem ? nextItem.classNum : null;
    items.forEach(function (item) {
      item.isNextStep = !!(nextItem && item.classNum === nextItem.classNum);
      item.isCurrent = item.isNextStep;
      item.isNext =
        !!(currentNum && item.classNum === currentNum + 1 && !item.completed);
    });
    return items;
  }

  function applyPracticeProgressFields(items) {
    items.forEach(function (item) {
      if (item.practiceProgressPercent == null) item.practiceProgressPercent = 0;
      var stub = state.curriculumStubProgress[item.classNum];
      if (stub) {
        if (stub.practice) item.practiceProgressPercent = 100;
        else if (stub.practiceProgress != null) {
          item.practiceProgressPercent = Math.max(
            0,
            Math.min(100, Number(stub.practiceProgress) || 0)
          );
        }
      }
      if (item.practiceCompleted) {
        if (!item.practiceProgressPercent || item.practiceProgressPercent < 1) {
          item.practiceProgressPercent = 100;
        }
      } else if (item.practiceProgressPercent >= 100) {
        item.practiceProgressPercent = 0;
      }
    });
    return items;
  }

  function normalizedPracticePercent(item) {
    return Math.max(0, Math.min(100, Math.round(Number(item.practiceProgressPercent) || 0)));
  }

  function isPracticeAvailable(item) {
    if (item.practiceCompleted) return true;
    if (item.isCurrent || item.isNext) return true;
    return false;
  }

  function isPracticeDone(item) {
    return !!item.practiceCompleted || normalizedPracticePercent(item) >= 100;
  }

  function isLessonAvailable(item) {
    if (item.lessonCompleted) return true;
    return isPracticeDone(item) && !!item.isCurrent;
  }

  function getLessonLockedLabel(item) {
    if (!isPracticeDone(item)) return "После подготовки";
    return "Недоступно";
  }

  function classActionLockIcon() {
    return (
      '<svg class="class-action-icon curriculum-lock-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.25"/>' +
      '<path d="M5.5 7V5.25a2.75 2.75 0 015.5 0V7" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function renderCurriculumLockedSlot(label) {
    return (
      '<span class="curriculum-locked-slot" aria-disabled="true">' +
      classActionLockIcon() +
      '<span class="curriculum-locked-text">' +
      esc(label) +
      "</span></span>"
    );
  }

  function normalizeCurriculumItems(items) {
    if (!items || !items.length) return items || [];
    items.forEach(function (item) {
      var stub = state.curriculumStubProgress[item.classNum];
      if (!stub) return;
      if (stub.lesson) item.lessonCompleted = true;
      if (stub.practice) item.practiceCompleted = true;
      item.completed = item.lessonCompleted && item.practiceCompleted;
      item.hasProgress = item.lessonCompleted || item.practiceCompleted;
    });
    applySequentialCurriculumBackfill(items);
    applyPracticeProgressFields(items);
    return applyNextStepFlags(items);
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
      item.practiceCompleted = true;
      item.practiceProgressPercent = 100;
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
    if (item.lessonCompleted && item.practiceCompleted) return "passed";
    if (item.isCurrent) return "current";
    if (item.isNext) return "next";
    if (item.lessonCompleted || item.practiceCompleted) return "partial";
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
      kind === "practice"
        ? done
          ? "Практика выполнена"
          : "Практика не выполнена"
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
    var reportLabel = "AI Report";
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
        '" aria-label="AI Report — отчёт AI-агента с урока">' +
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

  function renderCurriculumActionBtn(kind, classNum, topic, disabled, options) {
    options = options || {};
    var isBook = kind === "lesson";
    var label = isBook ? "Book Class" : "Practice";
    if (kind === "practice" && options.availableLabel) {
      label = "Доступно";
    }
    var btnClass = isBook ? "class-action-btn--primary" : "class-action-btn--outline";
    if (kind === "practice" && options.availableLabel) {
      btnClass = "class-action-btn--available";
    }
    if (kind === "practice" && options.done) {
      btnClass = "class-action-btn--outline class-action-btn--practice-done";
    }
    var icon = isBook ? classActionCalendarIcon() : classActionBookIcon();
    var progressPct = options.progressPercent;
    var showProgress =
      kind === "practice" &&
      !disabled &&
      progressPct != null &&
      progressPct > 0;
    var labelHtml = showProgress
      ? '<span>Practice</span><span class="practice-progress-pct">' +
        Math.round(progressPct) +
        "%</span>"
      : "<span>" + label + "</span>";
    var progressClass = showProgress ? " class-action-btn--practice-progress" : "";
    return (
      '<button type="button" class="class-action-btn ' +
      btnClass +
      progressClass +
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
      labelHtml +
      "</button>"
    );
  }

  function renderCurriculumPracticePart(item) {
    var pct = normalizedPracticePercent(item);
    if (item.practiceCompleted) {
      return renderCurriculumActionBtn("practice", item.classNum, item.title, false, {
        progressPercent: pct,
        done: true,
      });
    }
    if (!isPracticeAvailable(item)) {
      return renderCurriculumLockedSlot("Недоступно");
    }
    if (pct > 0) {
      return renderCurriculumActionBtn("practice", item.classNum, item.title, false, {
        progressPercent: pct,
      });
    }
    return renderCurriculumActionBtn("practice", item.classNum, item.title, false, {
      availableLabel: true,
    });
  }

  function renderCurriculumLessonPart(item) {
    if (item.lessonCompleted) {
      return renderCurriculumLessonStatus(item);
    }
    if (!isLessonAvailable(item)) {
      return renderCurriculumLockedSlot(getLessonLockedLabel(item));
    }
    return renderCurriculumActionBtn("lesson", item.classNum, item.title, false);
  }

  function renderCurriculumActions(item, items) {
    items = items || state.curriculumItems || [];
    var phase = getClassRowPhase(item);
    var practicePart = renderCurriculumPracticePart(item);
    var lessonPart = renderCurriculumLessonPart(item);

    if (phase === "passed") {
      return (
        '<div class="curriculum-actions curriculum-actions--status">' +
        practicePart +
        lessonPart +
        "</div>"
      );
    }

    return (
      '<div class="curriculum-actions curriculum-actions--buttons curriculum-actions--mixed">' +
      practicePart +
      lessonPart +
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
        return !item.lessonCompleted && !item.practiceCompleted;
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
      phase === "passed"
        ? "is-passed"
        : phase === "current"
          ? "is-current"
          : phase === "next"
            ? "is-next"
            : "is-future";
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
      renderCurriculumActions(item, state.curriculumItems) +
      "</div>" +
      "</li>"
    );
  }

  function bindCurriculumListInteractions(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll(".curriculum-status-pill--report").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setAppNavView("home");
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
          openPracticeStub(classNum, topic);
        }
      });
    });
  }

  function formatCurriculumClassLabel(item) {
    if (item.isCurrent) {
      return "Class " + item.classNum + " · Текущий";
    }
    if (item.isNext) {
      return "Class " + item.classNum + " · Следующая";
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

    var enrollment = getActiveEnrollment();
    if (!enrollment) {
      section.hidden = false;
      if (summaryEl) {
        summaryEl.textContent = "Программа не выбрана";
      }
      if (progressFill) progressFill.style.width = "0%";
      listEl.innerHTML =
        '<li class="curriculum-empty">' +
        '<p>Выберите программу обучения — от неё зависит список Class в курсе.</p>' +
        '<button type="button" class="btn btn-secondary" id="btn-choose-program">Выбрать программу</button>' +
        "</li>";
      var chooseBtn = document.getElementById("btn-choose-program");
      if (chooseBtn) {
        chooseBtn.addEventListener("click", function () {
          goToProgramSelection();
        });
      }
      return;
    }

    refreshCurriculumState();
    var items = state.curriculumItems;
    var completedCount = items.filter(function (item) {
      return item.completed;
    }).length;
    var progressPercent =
      items.length > 0 ? Math.min(100, Math.round((completedCount / items.length) * 100)) : 0;

    section.hidden = false;
    if (summaryEl) {
      var programLabel = enrollment.program_name || "Программа";
      summaryEl.textContent =
        programLabel +
        " · " +
        (enrollment.level_name || enrollment.program_level || "") +
        " · пройдено " +
        completedCount +
        " из " +
        items.length +
        " Class";
    }
    if (progressFill) {
      progressFill.style.width = progressPercent + "%";
    }
    var progressBar = document.getElementById("curriculum-progress");
    if (progressBar) {
      progressBar.setAttribute("aria-valuenow", String(progressPercent));
    }

    if (!items.length) {
      listEl.innerHTML =
        '<li class="curriculum-empty">Нет Class в программе</li>';
      if (scrollEl) scrollEl.scrollTop = 0;
      return;
    }

    var visibleItems = sortCurriculumSequential(items);

    listEl.innerHTML = visibleItems.map(renderCurriculumItemHtml).join("");
    bindCurriculumListInteractions(listEl);
    scrollCurriculumToCurrent(scrollEl, listEl);

    var selectedReport = state.reports.find(function (r) {
      return r.id === state.selectedId;
    });
    renderNextStepBanner(selectedReport || null);
  }

  function updateCurriculumReportLinks() {
    document.querySelectorAll(".curriculum-status-pill--report").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.reportId === state.selectedId);
    });
  }

  function markCurriculumStubProgress(classNum, patch) {
    if (isDemo && (patch.lesson || patch.practice)) {
      fetch(
        DashboardApi.apiUrl(
          "/api/demo/curriculum/" + encodeURIComponent(classNum) + "/complete"
        ),
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson: !!patch.lesson,
          practice: !!patch.practice,
        }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("demo completion failed");
          return res.json();
        })
        .then(function (data) {
          applyServerCurriculum(data);
          renderCurriculumProgram();
        })
        .catch(function (err) {
          console.warn("[Curriculum] demo complete failed:", err);
        });
      return;
    }
    state.curriculumStubProgress[classNum] = Object.assign(
      {},
      state.curriculumStubProgress[classNum] || {},
      patch
    );
    normalizeCurriculumItems(state.curriculumItems);
    renderCurriculumProgram();
  }

  function resetBookClassFlow() {
    state.bookClassFlow = { step: "teacher", teacherId: null, slot: null };
    showBookClassStep("teacher");
    var confirmBtn = document.getElementById("btn-book-class-confirm");
    if (confirmBtn) confirmBtn.disabled = true;
  }

  function showBookClassStep(step) {
    var teacherStep = document.getElementById("book-class-step-teacher");
    var slotsStep = document.getElementById("book-class-step-slots");
    if (teacherStep) teacherStep.hidden = step !== "teacher";
    if (slotsStep) slotsStep.hidden = step !== "slots";
  }

  function renderBookClassTeachers() {
    var list = document.getElementById("book-class-teacher-list");
    if (!list) return;
    list.innerHTML = STUB_BOOKING_TEACHERS.map(function (teacher) {
      return (
        '<button type="button" class="book-class-teacher-card" data-teacher-id="' +
        esc(teacher.id) +
        '" role="listitem">' +
        '<span class="book-class-teacher-name">' +
        esc(teacher.name) +
        "</span>" +
        '<span class="book-class-teacher-note">' +
        esc(teacher.note) +
        "</span>" +
        "</button>"
      );
    }).join("");
    list.querySelectorAll(".book-class-teacher-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectBookClassTeacher(btn.dataset.teacherId);
      });
    });
  }

  function selectBookClassTeacher(teacherId) {
    state.bookClassFlow = state.bookClassFlow || {};
    state.bookClassFlow.teacherId = teacherId;
    state.bookClassFlow.slot = null;
    state.bookClassFlow.step = "slots";
    showBookClassStep("slots");
    renderBookClassSlots(teacherId);
    var confirmBtn = document.getElementById("btn-book-class-confirm");
    if (confirmBtn) confirmBtn.disabled = true;
  }

  function renderBookClassSlots(teacherId) {
    var teacher = STUB_BOOKING_TEACHERS.find(function (t) {
      return t.id === teacherId;
    });
    var list = document.getElementById("book-class-slot-list");
    var label = document.getElementById("book-class-slot-label");
    if (!list || !teacher) return;
    if (label) {
      label.textContent = "Шаг 2 · Время с " + teacher.name;
    }
    list.innerHTML = teacher.slots
      .map(function (slot, idx) {
        return (
          '<button type="button" class="book-class-slot-card" data-slot-index="' +
          idx +
          '" role="listitem">' +
          esc(slot) +
          "</button>"
        );
      })
      .join("");
    list.querySelectorAll(".book-class-slot-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        list.querySelectorAll(".book-class-slot-card").forEach(function (el) {
          el.classList.remove("is-selected");
        });
        btn.classList.add("is-selected");
        state.bookClassFlow.slot = teacher.slots[Number(btn.dataset.slotIndex)];
        var confirmBtn = document.getElementById("btn-book-class-confirm");
        if (confirmBtn) confirmBtn.disabled = false;
      });
    });
  }

  function getCurriculumStepActions(item) {
    var pct = normalizedPracticePercent(item);
    var practiceDone = isPracticeDone(item);
    return {
      practiceCompleted: practiceDone,
      practiceAvailable: isPracticeAvailable(item),
      practicePercent: pct,
      lessonCompleted: !!item.lessonCompleted,
      lessonReportId: item.lessonReportId || null,
      showBookClass: !item.lessonCompleted && isLessonAvailable(item),
      showBookClassPreview:
        !item.lessonCompleted && !!item.isCurrent && !practiceDone,
      showAiReport: !!(item.lessonCompleted && item.lessonReportId),
      showAiReportPreview:
        !item.lessonCompleted && !!(item.isCurrent || item.isNext),
      lessonLocked: !item.lessonCompleted && !isLessonAvailable(item),
      lessonLockedLabel: getLessonLockedLabel(item),
    };
  }

  function buildStepCardViewModel(item) {
    var actions = getCurriculumStepActions(item);
    var pct = actions.practicePercent;
    var eyebrow = item.isNext && !item.isCurrent ? "Следующая" : "Текущий";
    var title = "Тема " + item.classNum + " · " + item.title;
    var hasAiReport = actions.showAiReport;
    var hasReportPreview = actions.showAiReportPreview;
    var badge = null;

    if (state.studyPlan && state.studyPlan.status === "ahead") {
      badge = { text: "↗ Опережаете план", tone: "positive" };
    } else if (state.studyPlan && state.studyPlan.status === "behind") {
      badge = { text: "Нужно ускориться", tone: "warn" };
    }

    if (!actions.practiceCompleted) {
      var lead;
      if (actions.lessonCompleted) {
        lead =
          pct > 0
            ? "Вы остановились на " +
              pct +
              "% — завершите Practice по этой теме. Урок уже пройден: преподаватель видит ваш AI Report и ждёт, когда вы закроете подготовку."
            : "Начните Practice по этой теме. Урок уже состоялся — преподаватель изучил ваш AI Report и готов продолжить с того места, где вы остановились.";
      } else if (pct > 0) {
        lead =
          "Вы остановились на " +
          pct +
          "% — завершите Practice до 100%, и откроется Book Class. После занятия с преподавателем здесь появится AI Report.";
      } else {
        lead =
          "Сначала Practice до 100% — это подготовка к живому уроку. Затем Book Class: запись к преподавателю. После занятия появится AI Report с разбором.";
      }
      return {
        eyebrow: eyebrow,
        title: title,
        lead: lead,
        badge: badge,
        showProgress: pct > 0,
        progressPct: pct,
        showPracticePctOnBtn: pct > 0,
        showBook: actions.showBookClass,
        showBookPreview: actions.showBookClassPreview,
        showReport: actions.showAiReport,
        showReportPreview: hasReportPreview,
        reportIsActive:
          actions.showAiReport &&
          actions.lessonReportId &&
          actions.lessonReportId === state.selectedId,
        practiceIsPrimary: true,
        practiceLabel: pct > 0 ? "Продолжить Practice →" : "Начать Practice →",
        bookLabel: "Book Class",
        bookPreviewLabel: "Book Class",
        bookPreviewHint: "После подготовки",
        reportLabel: "AI Report →",
        reportPreviewLabel: "AI Report",
        reportPreviewHint: actions.lessonLocked
          ? actions.lessonLockedLabel
          : "После урока",
        reportId: actions.lessonReportId,
        classNum: item.classNum,
        topic: item.title,
      };
    }

    var leadReady =
      "Practice закрыта — вы готовы к live-сессии. ";
    if (actions.showBookClass) {
      leadReady +=
        "Забронируйте урок на платформе — так же, как кнопка Book Class в программе слева. После занятия с преподавателем здесь появится ваш AI Report.";
    } else if (hasAiReport) {
      leadReady +=
        "Откройте AI Report по пройденному уроку или вернитесь к Practice для повторения.";
    } else {
      leadReady += "Запишитесь на живой урок с преподавателем.";
    }

    return {
      eyebrow: eyebrow,
      title: title,
      lead: leadReady,
      badge: badge,
      showProgress: false,
      progressPct: 100,
      showPracticePctOnBtn: false,
      showBook: actions.showBookClass,
      showBookPreview: false,
      showReport: actions.showAiReport,
      showReportPreview: hasReportPreview,
      reportIsActive:
        actions.showAiReport &&
        actions.lessonReportId &&
        actions.lessonReportId === state.selectedId,
      practiceIsPrimary: !actions.showBookClass,
      practiceLabel: "Ещё Practice",
      bookLabel: "Book Class",
      bookPreviewLabel: "Book Class",
      bookPreviewHint: "После подготовки",
      reportLabel: "AI Report →",
      reportPreviewLabel: "AI Report",
      reportPreviewHint: actions.lessonLocked
        ? actions.lessonLockedLabel
        : "После урока",
      reportId: actions.lessonReportId,
      classNum: item.classNum,
      topic: item.title,
    };
  }

  function buildNextStepViewModel(nextItem, report) {
    return buildStepCardViewModel(nextItem);
  }

  function renderNextStepBookButton(bookBtn, view) {
    if (!bookBtn) return;
    var showSlot = view.showBook || view.showBookPreview;
    bookBtn.hidden = !showSlot;
    if (!showSlot) return;

    if (view.showBook) {
      bookBtn.disabled = false;
      bookBtn.type = "button";
      bookBtn.textContent = view.bookLabel;
      bookBtn.classList.remove("is-locked");
      bookBtn.classList.toggle("btn-primary", !view.practiceIsPrimary);
      bookBtn.classList.toggle("btn-secondary", view.practiceIsPrimary);
      bookBtn.setAttribute("aria-label", "Записаться на урок с преподавателем");
      return;
    }

    bookBtn.disabled = true;
    bookBtn.type = "button";
    bookBtn.classList.remove("btn-primary", "btn-secondary");
    bookBtn.classList.add("is-locked");
    bookBtn.setAttribute(
      "aria-label",
      "Book Class откроется после завершения Practice"
    );
    bookBtn.innerHTML =
      classActionLockIcon() +
      '<span class="class-next-step-action-label">' +
      esc(view.bookPreviewLabel) +
      "</span>" +
      '<span class="class-next-step-action-hint">' +
      esc(view.bookPreviewHint) +
      "</span>";
  }

  function renderNextStepReportButton(reportBtn, view) {
    if (!reportBtn) return;
    var showSlot = view.showReport || view.showReportPreview;
    reportBtn.hidden = !showSlot;
    if (!showSlot) return;

    if (view.showReport) {
      reportBtn.disabled = false;
      reportBtn.type = "button";
      reportBtn.textContent = view.reportLabel;
      reportBtn.classList.add("class-next-step-report-btn");
      reportBtn.classList.toggle("is-active", !!view.reportIsActive);
      reportBtn.classList.remove("is-locked");
      reportBtn.classList.remove("btn-link-style");
      reportBtn.setAttribute(
        "aria-label",
        "AI Report — отчёт AI-агента с урока"
      );
      return;
    }

    reportBtn.disabled = true;
    reportBtn.type = "button";
    reportBtn.classList.remove("class-next-step-report-btn", "is-active", "btn-link-style");
    reportBtn.classList.add("is-locked");
    reportBtn.setAttribute(
      "aria-label",
      "AI Report появится после занятия с преподавателем"
    );
    reportBtn.innerHTML =
      classActionLockIcon() +
      '<span class="class-next-step-action-label">' +
      esc(view.reportPreviewLabel) +
      "</span>" +
      '<span class="class-next-step-action-hint">' +
      esc(view.reportPreviewHint) +
      "</span>";
  }

  function renderNextStepPracticeButton(practiceBtn, view) {
    if (!practiceBtn) return;
    practiceBtn.classList.toggle("has-practice-pct", !!view.showPracticePctOnBtn);
    if (view.showPracticePctOnBtn) {
      practiceBtn.innerHTML =
        "Продолжить Practice " +
        '<span class="next-step-practice-pct">' +
        view.progressPct +
        "%</span>" +
        " →";
      return;
    }
    practiceBtn.textContent = view.practiceLabel;
  }

  function renderNextStepBanner(report) {
    var banner = document.getElementById("class-next-step");
    var titleEl = document.getElementById("class-next-step-title");
    var leadEl = document.getElementById("class-next-step-lead");
    var badgeEl = document.getElementById("class-next-step-badge");
    var progressWrap = document.getElementById("class-next-step-progress");
    var progressFill = document.getElementById("class-next-step-progress-fill");
    var progressPctEl = document.getElementById("class-next-step-progress-pct");
    var practiceBtn = document.getElementById("btn-next-step-practice");
    var bookBtn = document.getElementById("btn-next-step-book");
    var reportBtn = document.getElementById("btn-next-step-report");
    if (!banner || !leadEl) return;

    var stepItem = getNextStepClassItem(state.curriculumItems);
    if (!stepItem || stepItem.completed) {
      banner.hidden = true;
      state.nextStepPending = null;
      return;
    }

    var view = buildStepCardViewModel(stepItem);
    state.nextStepPending = {
      classNum: view.classNum,
      topic: view.topic,
      reportId: view.reportId,
    };

    var eyebrowEl = document.getElementById("class-next-step-eyebrow");
    if (eyebrowEl) eyebrowEl.textContent = view.eyebrow;
    banner.setAttribute(
      "aria-label",
      view.eyebrow === "Следующая" ? "Следующая тема программы" : "Текущий шаг программы"
    );

    if (titleEl) titleEl.textContent = view.title;
    leadEl.textContent = view.lead;

    if (badgeEl) {
      if (view.badge) {
        badgeEl.textContent = view.badge.text;
        badgeEl.className =
          "class-next-step-badge " + (view.badge.tone === "warn" ? "is-warn" : "is-positive");
        badgeEl.hidden = false;
      } else {
        badgeEl.hidden = true;
      }
    }

    if (progressWrap && progressFill && progressPctEl) {
      progressWrap.hidden = !view.showProgress;
      if (view.showProgress) {
        var width = Math.max(4, Math.min(100, view.progressPct));
        progressFill.style.width = width + "%";
        progressPctEl.textContent = view.progressPct + "%";
        progressWrap.setAttribute(
          "aria-label",
          "Прогресс Practice: " + view.progressPct + " процентов"
        );
      }
    }

    if (practiceBtn) {
      renderNextStepPracticeButton(practiceBtn, view);
      practiceBtn.hidden = false;
      practiceBtn.classList.toggle("btn-primary", view.practiceIsPrimary);
      practiceBtn.classList.toggle("btn-secondary", !view.practiceIsPrimary);
    }
    if (bookBtn) {
      renderNextStepBookButton(bookBtn, view);
    }
    if (reportBtn) {
      renderNextStepReportButton(reportBtn, view);
    }

    if (view.showReport && view.reportId) {
      updateCurriculumReportLinks();
    }

    banner.hidden = false;
  }

  function openBookClassStub(classNum, topic) {
    state.curriculumStubPending = { classNum: classNum, topic: topic, action: "lesson" };
    resetBookClassFlow();
    setText("book-class-topic", "Class " + classNum + " · " + topic);
    renderBookClassTeachers();
    var overlay = document.getElementById("book-class-overlay");
    if (overlay) overlay.hidden = false;
  }

  function openPracticeStub(classNum, topic) {
    state.curriculumStubPending = { classNum: classNum, topic: topic, action: "practice" };
    setText("practice-topic", topic);
    setText(
      "practice-material",
      "Материалы по теме «" +
        topic +
        "»: упражнения, карточки и задания появятся здесь после подключения библиотеки школы."
    );
    var overlay = document.getElementById("practice-overlay");
    if (overlay) overlay.hidden = false;
  }

  function closeCurriculumStubOverlays() {
    ["book-class-overlay", "practice-overlay"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    state.curriculumStubPending = null;
    resetBookClassFlow();
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
    bindClose("btn-practice-close");
    bindClose("btn-practice-cancel");

    var bookBack = document.getElementById("btn-book-class-back");
    if (bookBack) {
      bookBack.addEventListener("click", function () {
        resetBookClassFlow();
        renderBookClassTeachers();
      });
    }

    var nextBook = document.getElementById("btn-next-step-book");
    if (nextBook) {
      nextBook.addEventListener("click", function () {
        var pending = state.nextStepPending;
        if (!pending) return;
        openBookClassStub(pending.classNum, pending.topic);
      });
    }

    var nextSelf = document.getElementById("btn-next-step-practice");
    if (nextSelf) {
      nextSelf.addEventListener("click", function () {
        var pending = state.nextStepPending;
        if (!pending) return;
        openPracticeStub(pending.classNum, pending.topic);
      });
    }

    var nextReport = document.getElementById("btn-next-step-report");
    if (nextReport) {
      nextReport.addEventListener("click", function () {
        var pending = state.nextStepPending;
        if (!pending || !pending.reportId) return;
        selectLesson(pending.reportId);
      });
    }

    var bookConfirm = document.getElementById("btn-book-class-confirm");
    if (bookConfirm) {
      bookConfirm.addEventListener("click", function () {
        var pending = state.curriculumStubPending;
        if (!pending || pending.action !== "lesson") return;
        if (!state.bookClassFlow || !state.bookClassFlow.slot) return;
        markCurriculumStubProgress(pending.classNum, { lesson: true });
        closeCurriculumStubOverlays();
      });
    }

    var selfConfirm = document.getElementById("btn-practice-confirm");
    if (selfConfirm) {
      selfConfirm.addEventListener("click", function () {
        var pending = state.curriculumStubPending;
        if (!pending || pending.action !== "practice") return;
        // STUB: real materials library will track completion via API.
        markCurriculumStubProgress(pending.classNum, { practice: true, practiceProgress: 100 });
        closeCurriculumStubOverlays();
      });
    }

    ["book-class-overlay", "practice-overlay"].forEach(function (id) {
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
    var presets = cfg("intensity_presets", {}) || {};
    var raw = key && presets[key] ? presets[key] : null;
    if (!raw) return null;
    return {
      label: raw.label,
      classesPerWeek: raw.classes_per_week,
      tutorLessons: raw.tutor_lessons_per_week,
      practiceDays: raw.practice_days_per_week,
    };
  }

  function countCurriculumProgress(goal, plan, reports, progressTracker) {
    var items = state.curriculumItems && state.curriculumItems.length
      ? state.curriculumItems.slice()
      : [];
    if (!items.length && state.learningContext && state.learningContext.curriculum) {
      items = getCurriculumItemsFromContext();
    } else if (!items.length && typeof EnglishAgentSLC !== "undefined") {
      var snapshot = EnglishAgentSLC.build({
        studentId: STUDENT_ID,
        goal: goal,
        studyPlan: plan,
        reports: reports,
        progressTracker: progressTracker,
        programCatalog: getProgramCatalog(),
        programLevels: PROGRAM_LEVELS,
        enrollmentRecord:
          typeof EnrollmentState !== "undefined" && EnrollmentState.isEnrolled()
            ? EnrollmentState.getActive()
            : null,
        enrolledPlanId:
          (EnrollmentState.getActive() && EnrollmentState.getActive().plan_id) ||
          readEnrolledPlanId() ||
          state.subscriptionPlanId,
      });
      if (snapshot.curriculum && snapshot.curriculum.classes) {
        items = snapshot.curriculum.classes.map(function (item) {
          return Object.assign({}, item);
        });
      }
    }
    if (!items.length) {
      return { total: 0, completed: 0, remaining: 0 };
    }
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

  function applyDemoGoalFromServer(data) {
    DashboardApi.applyReportsBundle(state, data, { goalMetrics: true });
    state.reports = sortReports(state.reports);
    if (data.curriculum) {
      applyServerCurriculum(data.curriculum);
    }
    rebuildStudentLearningContext();
    setPreviewBanners(false);
    renderStudentOverview();
    refreshAnalyticsPanels();
  }

  function applyIntensityToGoalState(presetKey) {
    if (!hasGoal()) return;
    var intensityCfg = getIntensityConfig(presetKey);
    state.goal.study_intensity_preset = presetKey || null;
    if (intensityCfg) {
      state.goal.tutor_lessons_per_week = intensityCfg.tutorLessons;
      state.goal.practice_days_per_week = intensityCfg.practiceDays;
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
    if (isDemo) {
      DashboardApi.postDemoGoal(
        buildGoalPatchPayload({ study_intensity_preset: presetKey || null })
      ).then(applyDemoGoalFromServer);
    }
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
      return;
    }

    applyIntensityToGoalState(presetKey);
    var payload = buildGoalPatchPayload({ study_intensity_preset: presetKey || null });

    fetch(DashboardApi.apiUrl("/api/students/" + encodeURIComponent(STUDENT_ID) + "/goal"), {
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
        rebuildStudentLearningContext();
        renderStudentOverview();
      })
      .catch(function () {
        rebuildStudentLearningContext();
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
    return Math.min(durationWeeksMax(), Math.max(durationWeeksMin(), Math.round(weeks)));
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
    var editBtn = document.getElementById("btn-goal-edit");
    var analyticsEditBtn = document.getElementById("btn-analytics-goal-edit");
    var closeBtn = document.getElementById("btn-goal-close");
    var cancelBtn = document.getElementById("btn-goal-cancel");
    var scenarioField = document.getElementById("goal-scenario-field");

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
      DashboardApi.postDemoGoal(payload)
        .then(function (data) {
          applyDemoGoalFromServer(data);
          closeGoalModal();
        })
        .catch(function (err) {
          if (errorEl) {
            errorEl.textContent = err.message || "Ошибка сохранения";
            errorEl.hidden = false;
          }
        });
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Сохранение…";
    }
    if (errorEl) errorEl.hidden = true;

    fetch(DashboardApi.apiUrl("/api/students/" + encodeURIComponent(STUDENT_ID) + "/goal"), {
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
        rebuildStudentLearningContext();
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

  function renderLessonReport(report, isPrimary) {
    if (!state.curriculumItems.length && getActiveEnrollment()) {
      refreshCurriculumState();
    }

    var lessonDate = report.lesson_date || report.created_at;
    var classNum = findClassNumForReport(report);
    var topic = formatLessonTopic(report);

    setText("dash-date-label", isPrimary ? "Дата последнего урока" : "Дата урока");
    setText("dash-last-date", formatDate(lessonDate));
    setText("lesson-report-class", classNum ? formatReportClassLabel(classNum) : "Класс —");
    setText("lesson-report-topic", topic);
    var topicLabel = document.querySelector(".lesson-topic-label");
    if (topicLabel) {
      topicLabel.textContent = isPrimary
        ? "AI Report · отчёт AI-агента с урока"
        : "AI Report · архив урока";
    }
    var heading = document.getElementById("lesson-report-heading");
    if (heading) {
      var sep = heading.querySelector(".lesson-report-sep");
      if (sep) sep.hidden = !classNum || !topic || topic === "—";
    }

    renderGrammarList("grammar-list-current", report.grammar_errors);
    renderGrammarList("grammar-list-detailed", report.grammar_errors);
    renderStuckTopics(state.errorTracking);
    renderPrioritizedWeakTopics(report.prioritized_weak_topics || []);

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
    renderNextStepBanner(report);
  }

  function updateLessonContextBar(report, isPrimary) {
    var bar = document.getElementById("lesson-context-bar");
    var label = document.getElementById("lesson-context-label");
    if (!bar || !label) return;

    if (isPrimary || !report) {
      bar.hidden = true;
      return;
    }

    var lessonDate = report.lesson_date || report.created_at;
    var classNum = findClassNumForReport(report);
    var classPart = classNum ? formatReportClassLabel(classNum) + " · " : "";
    label.textContent = "Архив · " + classPart + formatDate(lessonDate);
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
    if (status === "stuck" && n >= stuckThresholdLessons()) {
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
      '<stop offset="0%" stop-color="#6687FF" stop-opacity="0.3"/>' +
      '<stop offset="100%" stop-color="#6687FF" stop-opacity="0"/>' +
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
      '" text-anchor="middle" fill="#6687FF" font-size="13" font-weight="700" font-family="Inter,sans-serif">' +
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
      el.title = cefrCaption();
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


  function applyServerCurriculum(data) {
    if (!data || !data.classes || !data.classes.length) {
      state.curriculumItems = [];
      state.reportClassMap = {};
      return;
    }
    var items = DashboardApi.mapCurriculumResponse(data);
    state.serverCurriculum = data;
    state.reportClassMap = buildReportClassMap(items, state.reports);
    attachClassIndexToReports(state.reports, state.reportClassMap);
    state.curriculumItems = normalizeCurriculumItems(
      enrichCurriculumWithReportIds(items, state.reportClassMap)
    );
    if (state.learningContext && typeof EnglishAgentSLC !== "undefined") {
      EnglishAgentSLC.syncComputed(
        state.learningContext,
        state.curriculumItems,
        state.studyPlan,
        state.goal
      );
    }
  }

  function finishDashboardRender() {
    if (isDemo && !hasGoal() && state.previewBundle && !state.errorTracking) {
      state.errorTracking = state.previewBundle.error_tracking || null;
    }

    var ctx = resolveMetricsContext();
    setPreviewBanners(!!ctx && ctx.isPreview);
    refreshAnalyticsPanels();

    var primary = getPrimaryReport();
    if (primary) {
      state.selectedId = primary.id;
    }
    renderStudentOverview();
    if (!state.reports.length) {
      setHtml("grammar-list-current", emptyMsg("Пока нет отчётов по урокам."));
      setHtml("grammar-list-detailed", emptyMsg("Пока нет отчётов по урокам."));
      return;
    }
    if (primary) {
      selectLesson(primary.id, { switchTab: false });
    } else {
      selectLesson(state.reports[0].id, { switchTab: false });
    }
    if (!isDemo) renderChart(state.reports.slice().reverse());
  }

  function loadDashboardFromStaticPreview() {
    var loadingEl = document.getElementById("dash-loading");
    var errorEl = document.getElementById("dash-error");
    var mainEl = document.querySelector(".main");
    if (loadingEl) loadingEl.hidden = false;
    if (mainEl) mainEl.style.visibility = "hidden";

    return DashboardApi.loadStaticPreviewBundle()
      .then(function (data) {
        state.previewBundle = data;
        DashboardApi.applyReportsBundle(state, data, { goalMetrics: false });
        state.reports = sortReports(state.reports);
        state.errorTracking = data.error_tracking || null;
        if (data.curriculum) {
          applyServerCurriculum(data.curriculum);
        }
        rebuildStudentLearningContext();
        if (errorEl) errorEl.hidden = true;
      })
      .catch(function (err) {
        console.error("[Preview] Static preview load failed:", err);
        if (errorEl) {
          errorEl.textContent =
            "Не удалось загрузить demo-preview.json рядом с dashboard.html. " +
            (err.message || "");
          errorEl.hidden = false;
        }
      })
      .then(function () {
        finishDashboardRender();
      })
      .finally(function () {
        refreshAnalyticsPanels();
        if (loadingEl) loadingEl.hidden = true;
        if (mainEl) mainEl.style.visibility = "";
      });
  }

  function loadDashboardFromApi() {
    if (DashboardApi.isStaticPreviewMode()) {
      return loadDashboardFromStaticPreview();
    }

    var loadingEl = document.getElementById("dash-loading");
    var errorEl = document.getElementById("dash-error");
    var mainEl = document.querySelector(".main");
    if (loadingEl) loadingEl.hidden = false;
    if (mainEl) mainEl.style.visibility = "hidden";

    var previewPromise = ensurePreviewBundle();

    var livePromise = DashboardApi.fetchReportsBundle()
      .then(function (data) {
        if (!isDemo) {
          document.querySelectorAll(".demo-only").forEach(function (el) {
            el.hidden = true;
          });
        }

        var applyGoalMetrics = !isDemo || hasGoal();
        DashboardApi.applyReportsBundle(state, data, { goalMetrics: applyGoalMetrics });
        state.reports = sortReports(state.reports);

        if (applyGoalMetrics && data.error_tracking) {
          state.errorTracking = data.error_tracking;
        }

        rebuildStudentLearningContext();

        if (data.curriculum && applyGoalMetrics) {
          applyServerCurriculum(data.curriculum);
          return null;
        }
        var enrollment = getActiveEnrollment();
        if (!enrollment) return null;
        return DashboardApi.fetchCurriculum(enrollment.program_id).then(applyServerCurriculum);
      })
      .catch(function (err) {
        if (errorEl) {
          errorEl.textContent =
            "Не удалось загрузить отчёты: " + (err.message || "ошибка сети");
          errorEl.hidden = false;
        }
        return null;
      });

    return Promise.all([previewPromise, livePromise])
      .then(function () {
        finishDashboardRender();
      })
      .catch(function () {
        finishDashboardRender();
      })
      .finally(function () {
        refreshAnalyticsPanels();
        if (loadingEl) loadingEl.hidden = true;
        if (mainEl) mainEl.style.visibility = "";
      });
  }

  function bootstrapDashboard() {
    initSidebarResize();
    initGrammarToggles();
    initGoalModal();
    initGoalPlanCollapse();
    initStudyPlanCollapse();
    initActivityHeatmapPopover();
    initAppNav();
    initNavPlanWidget();
    initProgramsPage();

    document.querySelectorAll("#view-home .tab, #view-analytics .analytics-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var root = tab.closest(".app-view");
        activateTab(tab.dataset.tab, root);
      });
    });

    initLessonNavigation();
    initCurriculumActions();
    initBuyLessonsButton();
    initSidebarProfilePrograms();
    loadDashboardFromApi();
  }

  if (typeof DashboardApi === "undefined") {
    console.error("[Dashboard] dashboard-api.js failed to load");
    var dashErr = document.getElementById("dash-error");
    if (dashErr) {
      dashErr.hidden = false;
      dashErr.textContent = "Не удалось загрузить скрипты дашборда. Обновите страницу.";
    }
  } else {
    var boot = function () {
      loadProgramCatalogAndEnrollment()
        .finally(function () {
          bootstrapDashboard();
        });
    };
    if (DashboardApi.isStaticPreviewMode()) {
      DashboardApi.loadStaticPreviewConfig().finally(boot);
    } else {
      DashboardApi.loadAppConfig().finally(boot);
    }
  }
})();
