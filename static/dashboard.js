(function () {
  var STUDENT_ID = window.STUDENT_ID || "";
  var isDemo =
    !STUDENT_ID ||
    STUDENT_ID === "__STUDENT_ID__" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      STUDENT_ID
    );

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var target = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(function (t) {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      document.querySelectorAll(".tab-panel").forEach(function (panel) {
        panel.classList.toggle("active", panel.id === "panel-" + target);
      });
    });
  });

  if (isDemo) return;

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
      renderDashboard(data);
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

  function renderDashboard(data) {
    var reports = (data.reports || []).slice().sort(function (a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    var latest = reports[0];

    setText("dash-name", data.student_name || data.student_email || "Студент");
    setText("dash-avatar", initials(data.student_name || data.student_email));

    setText("dash-stat-lessons", String(reports.length));
    setText(
      "dash-stat-avg",
      reports.length
        ? formatScore(average(reports.map(function (r) { return r.fluency_score; }))) +
            " / 10"
        : "—"
    );
    setText("dash-stat-cefr", latest ? latest.vocabulary_level || "—" : "—");
    setText(
      "dash-last-date",
      latest ? formatDate(latest.lesson_date || latest.created_at) : "—"
    );
    setText("dash-lesson-topic", latest ? "Последний урок" : "—");

    if (!reports.length) {
      setHtml("grammar-list-current", emptyMsg("Пока нет отчётов по урокам."));
      setHtml("grammar-list-detailed", emptyMsg("Пока нет отчётов по урокам."));
      return;
    }

    renderGrammarList("grammar-list-current", latest.grammar_errors);
    renderGrammarList("grammar-list-detailed", latest.grammar_errors);

    setBadge("badge-grammar-current", grammarBadge(latest.grammar_errors));
    setBadge("badge-vocab-current", latest.vocabulary_level || "—", false);
    setBadge("badge-fluency-current", formatScore(latest.fluency_score), true);
    setBadge("badge-grammar-detailed", grammarBadge(latest.grammar_errors));
    setBadge("badge-vocab-detailed", latest.vocabulary_level || "—", false);
    setBadge("badge-fluency-detailed", formatScore(latest.fluency_score), true);

    var vocabLive = document.getElementById("vocab-live");
    if (vocabLive) {
      vocabLive.hidden = false;
      setText("vocab-level-live", latest.vocabulary_level || "—");
    }

    var fluencyLive = document.getElementById("fluency-live");
    if (fluencyLive) {
      fluencyLive.hidden = false;
      setText("fluency-score-live", formatScore(latest.fluency_score));
    }

    renderList("plan-weak-topics", latest.weak_topics);
    renderList("plan-recommendations", latest.recommendations, true);
    renderList("highlight-focus", latest.weak_topics);
    renderList("highlight-win", latest.recommendations);

    setText("summary-score-ring", formatScore(latest.fluency_score));
    setText("summary-score-num", formatScore(latest.fluency_score));
    setText(
      "summary-text",
      buildSummaryText(data.student_name, latest)
    );

    renderChart(reports.slice().reverse());
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

  function renderGrammarList(id, errors) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!errors || !errors.length) {
      el.innerHTML = emptyMsg("Грамматических ошибок не зафиксировано.");
      return;
    }
    el.innerHTML = errors
      .map(function (e) {
        var said = esc(e.error || e.example || "");
        var correct = esc(e.correction || "");
        var tag = esc(e.example || "");
        return (
          '<li class="error-item">' +
          '<div class="error-row">' +
          (said ? '<span class="said">«' + said + '»</span>' : "") +
          (said && correct ? '<span class="arrow">→</span>' : "") +
          (correct ? '<span class="correct">«' + correct + '»</span>' : "") +
          "</div>" +
          (tag ? '<span class="error-tag">' + tag + "</span>" : "") +
          "</li>"
        );
      })
      .join("");
  }

  function renderList(id, items, ordered) {
    var el = document.getElementById(id);
    if (!el || !items || !items.length) return;
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
    var min = 0;
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
    if (!numeric) {
      el.classList.remove("amber", "green");
      el.classList.add("cefr-badge");
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
    return '<li class="error-item" style="list-style:none"><span class="error-tag">' + esc(text) + "</span></li>";
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
