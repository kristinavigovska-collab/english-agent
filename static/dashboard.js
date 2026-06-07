(function () {
  var STUDENT_ID = window.STUDENT_ID || "";
  var isDemo =
    !STUDENT_ID ||
    STUDENT_ID === "__STUDENT_ID__" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      STUDENT_ID
    );

  var CEFR_CAPTION = "Уровень CEFR (международная шкала A1–C2)";

  var state = {
    reports: [],
    studentName: "Студент",
    selectedId: null,
    historyBound: false,
  };

  var DEMO_REPORTS = [
    {
      id: "demo-7",
      lesson_date: "2026-05-28T14:00:00Z",
      created_at: "2026-05-28T14:00:00Z",
      grammar_errors: [
        {
          error: "I have went to Paris last year",
          correction: "I went to Paris last year",
          explanation:
            "Маркер «last year» указывает на завершённое действие в прошлом — нужен Past Simple (went). Present Perfect (have + V3) с конкретным прошлым временем не используется.",
        },
        {
          error: "She don't like spicy food",
          correction: "She doesn't like spicy food",
          explanation:
            "В Present Simple с she/he/it вспомогательный глагол — doesn't, а основной глагол без окончания -s.",
        },
        {
          error: "I am living here since 2020",
          correction: "I have lived here since 2020",
          explanation:
            "Since + точка в прошлом требует Present Perfect — действие началось тогда и продолжается. Present Continuous (am living) с since не сочетается.",
        },
        {
          error: "More better than before",
          correction: "Much better than before",
          explanation:
            "У коротких прилагательных сравнительная степень — суффикс -er (better), без more. Much усиливает сравнение: much better.",
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
        },
        {
          error: "He suggested to go earlier",
          correction: "He suggested going earlier",
          explanation:
            "После suggest нужен gerund (-ing), а не infinitive с to. Правильно: suggest doing something.",
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
        },
        {
          error: "Much people were waiting",
          correction: "Many people were waiting",
          explanation:
            "Much используется с неисчисляемыми существительными. People — исчисляемое, поэтому many.",
        },
        {
          error: "She is teacher",
          correction: "She is a teacher",
          explanation:
            "Перед профессией в единственном числе нужен неопределённый артикль a/an: a teacher.",
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
    state.studentName = "Анна Петрова";
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
    setText("dash-stat-cefr", latest ? latest.vocabulary_level || "—" : "—");
  }

  function renderLessonReport(report, isLatest) {
    var lessonDate = report.lesson_date || report.created_at;

    setText("dash-date-label", isLatest ? "Дата последнего урока" : "Дата урока");
    setText("dash-last-date", formatDate(lessonDate));
    setText("lesson-topic-current", formatLessonTopic(report));

    renderGrammarList("grammar-list-current", report.grammar_errors);
    renderGrammarList("grammar-list-detailed", report.grammar_errors);

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

    renderList("plan-weak-topics", report.weak_topics);
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
        return (
          '<li class="error-item">' +
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
