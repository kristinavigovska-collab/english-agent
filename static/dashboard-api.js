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

  /** Live Server (:5500) — optional API proxy to uvicorn :8000 (not used in static preview mode) */
  function apiOrigin() {
    if (global.API_ORIGIN !== undefined && global.API_ORIGIN !== null) {
      return String(global.API_ORIGIN).replace(/\/$/, "");
    }
    if (isStaticPreviewMode()) {
      return "";
    }
    var loc = global.location;
    if (!loc || !loc.hostname) return "";
    var host = loc.hostname;
    var port = loc.port;
    var isLocal = host === "localhost" || host === "127.0.0.1";
    if (loc.protocol === "file:") {
      return "";
    }
    if (
      isLocal &&
      (port === "5500" || port === "5501" || port === "5502" || port === "3000")
    ) {
      return "";
    }
    return "";
  }

  function apiUrl(path) {
    var normalized = path.charAt(0) === "/" ? path : "/" + path;
    return apiOrigin() + normalized;
  }

  /** Live Server / static/dashboard.html — UI preview from local JSON fixtures */
  function isStaticPreviewMode() {
    if (global.STATIC_DASHBOARD_PREVIEW === true) return true;
    if (global.STATIC_DASHBOARD_PREVIEW === false) return false;
    var loc = global.location;
    if (!loc) return false;
    var host = loc.hostname;
    var port = loc.port;
    if (host !== "localhost" && host !== "127.0.0.1") return false;
    return port === "5500" || port === "5501" || port === "5502";
  }

  function isStaticDevServer() {
    return isStaticPreviewMode();
  }

  function staticAssetUrl(filename) {
    var loc = global.location;
    if (!loc || !loc.pathname) return "/static/" + filename;
    if (/\/static\//i.test(loc.pathname)) {
      return loc.pathname.replace(/[^/]+$/, filename);
    }
    return "/static/" + filename;
  }

  function isDemoApiBase(base) {
    return /\/api\/demo$/i.test(String(base || ""));
  }

  function isDemoStudentId(studentId) {
    var id = studentId || global.STUDENT_ID || "";
    return !id || id === "__STUDENT_ID__" || !UUID_RE.test(id);
  }

  function getApiBase() {
    var enrollmentDemo =
      global.EnrollmentState &&
      global.EnrollmentState.current &&
      global.EnrollmentState.current.is_demo;
    return isDemoStudentId(global.STUDENT_ID) || enrollmentDemo
      ? apiUrl("/api/demo")
      : apiUrl("/api");
  }

  function liveApiBase() {
    return apiUrl("/api");
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

  function loadStaticPreviewConfig() {
    if (CONFIG) return Promise.resolve(CONFIG);
    return fetch(staticAssetUrl("demo-config.json"))
      .then(function (res) {
        if (!res.ok) throw new Error("demo-config.json not found");
        return res.json();
      })
      .then(function (data) {
        CONFIG = data;
        configLoaded = true;
        configError = null;
        global.DashboardApi.CONFIG = CONFIG;
        return CONFIG;
      })
      .catch(function (err) {
        console.warn("[Preview] Using built-in config fallback:", err);
        CONFIG = {
          cefr_levels: ["A1", "A2", "B1", "B2", "C1", "C2"],
          intensity_presets: {},
          stuck_threshold_lessons: 3,
          cefr_hours_per_level: {},
          activity_heatmap_weeks: 16,
          plan_disclaimer: "",
          plan_disclaimer_short: "",
        };
        configLoaded = true;
        global.DashboardApi.CONFIG = CONFIG;
        return CONFIG;
      });
  }

  function loadStaticPreviewBundle() {
    return fetch(staticAssetUrl("demo-preview.json")).then(function (res) {
      if (!res.ok) {
        throw new Error("demo-preview.json not found (" + res.status + ")");
      }
      return res.json();
    });
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
    if (isDemoApiBase(base)) {
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
    if (isDemoApiBase(base)) {
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
    return fetch(apiUrl("/api/demo/goal"), {
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

  function fetchProgramsCatalog() {
    if (isStaticPreviewMode()) {
      return fetch(staticAssetUrl("demo-programs.json")).then(function (res) {
        if (!res.ok) {
          throw new Error("demo-programs.json not found (" + res.status + ")");
        }
        return res.json().then(function (data) {
          return data.programs || [];
        });
      });
    }
    return fetch(liveApiBase() + "/programs").then(function (res) {
      if (!res.ok) {
        throw new Error("programs fetch failed (" + res.status + ")");
      }
      return res.json().then(function (data) {
        return data.programs || [];
      });
    });
  }

  function fetchStudentEnrollment(studentId) {
    return fetch(
      liveApiBase() +
        "/students/" +
        encodeURIComponent(studentId) +
        "/enrollment"
    ).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (body) {
          throw new Error(body.detail || res.statusText);
        });
      }
      return res.json();
    });
  }

  function putStudentEnrollment(studentId, payload) {
    return fetch(
      liveApiBase() +
        "/students/" +
        encodeURIComponent(studentId) +
        "/enrollment",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      }
    ).then(function (res) {
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

  function applyReportsBundle(state, data, options) {
    options = options || {};
    var applyGoalMetrics = options.goalMetrics !== false;

    state.reports = data.reports || [];
    state.studentName = data.student_name || data.student_email || "Студент";

    if (applyGoalMetrics) {
      state.goal = goalFieldsFromBundle(data);
      state.studyPlan = data.study_plan || null;
      state.progressTracker = data.progress_tracker || null;
      state.errorTracking = data.error_tracking || null;
    }

    if (data.curriculum) {
      state.serverCurriculum = data.curriculum;
    }
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
    loadStaticPreviewConfig: loadStaticPreviewConfig,
    loadStaticPreviewBundle: loadStaticPreviewBundle,
    isStaticPreviewMode: isStaticPreviewMode,
    assertConfigLoaded: assertConfigLoaded,
    getApiBase: getApiBase,
    liveApiBase: liveApiBase,
    apiOrigin: apiOrigin,
    apiUrl: apiUrl,
    isStaticDevServer: isStaticDevServer,
    isDemoStudentId: isDemoStudentId,
    requireConfig: requireConfig,
    cfg: cfg,
    fetchReportsBundle: fetchReportsBundle,
    fetchCurriculum: fetchCurriculum,
    fetchProgramsCatalog: fetchProgramsCatalog,
    fetchStudentEnrollment: fetchStudentEnrollment,
    putStudentEnrollment: putStudentEnrollment,
    postDemoGoal: postDemoGoal,
    fetchPreviewBundle: fetchPreviewBundle,
    goalFieldsFromBundle: goalFieldsFromBundle,
    applyReportsBundle: applyReportsBundle,
    mapCurriculumResponse: mapCurriculumResponse,
  };
})(window);
