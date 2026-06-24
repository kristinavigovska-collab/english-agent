/**
 * Dashboard API helpers — ADR-002: server is source of truth for calculations.
 * Client loads CONFIG once; demo vs live differs only by API prefix.
 */
(function (global) {
  "use strict";

  var CONFIG = null;
  var configError = null;
  var configLoaded = false;

  var UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function isDemoStudentId(studentId) {
    var id = studentId || global.STUDENT_ID || "";
    return !id || id === "__STUDENT_ID__" || !UUID_RE.test(id);
  }

  function getApiBase() {
    var enrollmentDemo =
      global.EnrollmentState &&
      global.EnrollmentState.current &&
      global.EnrollmentState.current.is_demo;
    return isDemoStudentId(global.STUDENT_ID) || enrollmentDemo ? "/api/demo" : "/api";
  }

  function liveApiBase() {
    return "/api";
  }

  function assertConfigLoaded(config) {
    var required = [
      "cefr_levels",
      "intensity_presets",
      "stuck_threshold_lessons",
      "cefr_hours_per_level",
    ];
    var missing = required.filter(function (key) {
      return !config || config[key] == null;
    });
    if (missing.length) {
      console.error("[Config] Missing required config keys:", missing);
      return missing;
    }
    return [];
  }

  function showConfigErrorBanner() {
    var banner = document.getElementById("dash-config-error");
    if (banner) {
      banner.hidden = false;
      return;
    }
    var err = document.getElementById("dash-error");
    if (err) {
      err.hidden = false;
      err.textContent =
        "Не удалось загрузить конфигурацию. Обновите страницу.";
    }
  }

  function loadAppConfig() {
    return fetch(liveApiBase() + "/config")
      .then(function (res) {
        if (!res.ok) {
          throw new Error(res.statusText || "config fetch failed");
        }
        return res.json();
      })
      .then(function (data) {
        var missing = assertConfigLoaded(data);
        if (missing.length) {
          configError = new Error("Missing keys: " + missing.join(", "));
          showConfigErrorBanner();
          return null;
        }
        CONFIG = data;
        configLoaded = true;
        configError = null;
        global.DashboardApi.CONFIG = CONFIG;
        return CONFIG;
      })
      .catch(function (err) {
        configError = err;
        console.error("[Config] Failed to load /api/config:", err);
        showConfigErrorBanner();
        return null;
      });
  }

  function requireConfig() {
    if (!CONFIG) {
      throw new Error("App config not loaded");
    }
    return CONFIG;
  }

  function cfg(path, fallback) {
    if (!CONFIG) return fallback;
    var parts = String(path).split(".");
    var cur = CONFIG;
    for (var i = 0; i < parts.length; i += 1) {
      if (cur == null) return fallback;
      cur = cur[parts[i]];
    }
    return cur == null ? fallback : cur;
  }

  function fetchReportsBundle() {
    var base = getApiBase();
    if (base === "/api/demo") {
      return fetch(base + "/reports").then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(body.detail || res.statusText);
          });
        }
        return res.json();
      });
    }
    var studentId = global.STUDENT_ID;
    return fetch(
      liveApiBase() + "/students/" + encodeURIComponent(studentId) + "/reports"
    ).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (body) {
          throw new Error(body.detail || res.statusText);
        });
      }
      return res.json();
    });
  }

  function fetchCurriculum(programId) {
    var base = getApiBase();
    if (base === "/api/demo") {
      return fetch(base + "/curriculum").then(function (res) {
        if (!res.ok) throw new Error("curriculum fetch failed");
        return res.json();
      });
    }
    var studentId = global.STUDENT_ID;
    var url =
      liveApiBase() +
      "/students/" +
      encodeURIComponent(studentId) +
      "/curriculum?program_id=" +
      encodeURIComponent(programId || "");
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("curriculum fetch failed");
      return res.json();
    });
  }

  function postDemoGoal(payload) {
    return fetch("/api/demo/goal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (body) {
          throw new Error(body.detail || res.statusText);
        });
      }
      return res.json();
    });
  }

  function fetchPreviewBundle() {
    return fetch(liveApiBase() + "/preview/dashboard").then(function (res) {
      if (!res.ok) {
        return res.json().then(function (body) {
          throw new Error(body.detail || res.statusText);
        });
      }
      return res.json();
    });
  }

  function goalFieldsFromBundle(data) {
    return {
      target_cefr_level: data.target_cefr_level || null,
      target_date: data.target_date || null,
      goal_label: data.goal_label || null,
      goal_set_date: data.goal_set_date || null,
      goal_type: data.goal_type || null,
      target_duration_weeks: data.target_duration_weeks || null,
      scenario_description: data.scenario_description || null,
      goal_start_cefr_level: data.goal_start_cefr_level || null,
      tutor_lessons_per_week: data.tutor_lessons_per_week || 2,
      tutor_lesson_minutes: data.tutor_lesson_minutes || 60,
      practice_days_per_week: data.practice_days_per_week || 6,
      study_intensity_preset: data.study_intensity_preset || null,
    };
  }

  function applyReportsBundle(state, data) {
    state.reports = data.reports || [];
    state.studentName = data.student_name || data.student_email || "Студент";
    state.goal = {
      target_cefr_level: data.target_cefr_level || null,
      target_date: data.target_date || null,
      goal_label: data.goal_label || null,
      goal_set_date: data.goal_set_date || null,
      goal_type: data.goal_type || null,
      target_duration_weeks: data.target_duration_weeks || null,
      scenario_description: data.scenario_description || null,
      goal_start_cefr_level: data.goal_start_cefr_level || null,
      tutor_lessons_per_week: data.tutor_lessons_per_week || 2,
      tutor_lesson_minutes: data.tutor_lesson_minutes || 60,
      practice_days_per_week: data.practice_days_per_week || 6,
      study_intensity_preset: data.study_intensity_preset || null,
    };
    state.studyPlan = data.study_plan || null;
    state.progressTracker = data.progress_tracker || null;
    state.errorTracking = data.error_tracking || null;
    state.serverCurriculum = data.curriculum || null;
    return state;
  }

  function mapCurriculumItem(item) {
    return {
      classIndex: item.class_index,
      classNum: item.class_num,
      title: item.title,
      programId: item.program_id,
      lessonCompleted: !!item.lesson_completed,
      selfStudyCompleted: !!item.self_study_completed,
      completed: !!item.completed,
      isCurrent: !!item.is_current,
      lessonReportId: item.lesson_report_id || null,
      lessonDateIso: item.lesson_date_iso || null,
      hasProgress: !!item.has_progress,
    };
  }

  function mapCurriculumResponse(data) {
    if (!data || !data.classes) return [];
    return data.classes.map(mapCurriculumItem);
  }

  global.DashboardApi = {
    get CONFIG() {
      return CONFIG;
    },
    configError: configError,
    configLoaded: configLoaded,
    loadAppConfig: loadAppConfig,
    assertConfigLoaded: assertConfigLoaded,
    getApiBase: getApiBase,
    liveApiBase: liveApiBase,
    isDemoStudentId: isDemoStudentId,
    requireConfig: requireConfig,
    cfg: cfg,
    fetchReportsBundle: fetchReportsBundle,
    fetchCurriculum: fetchCurriculum,
    postDemoGoal: postDemoGoal,
    fetchPreviewBundle: fetchPreviewBundle,
    goalFieldsFromBundle: goalFieldsFromBundle,
    applyReportsBundle: applyReportsBundle,
    mapCurriculumResponse: mapCurriculumResponse,
  };
})(window);
