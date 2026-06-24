/**
 * Двухшаговый онбординг: выбор программы → выбор уровня → EnrollmentState.enroll()
 */
(function (global) {
  "use strict";

  var LEVEL_COPY = {
    beginner: "You can handle very basic greetings and simple everyday phrases.",
    elementary:
      "You can talk about yourself, family, and familiar situations with simple sentences.",
    pre_intermediate:
      "You can discuss past events and everyday topics, though you still make regular mistakes.",
    intermediate:
      "You can share opinions and follow most conversations on familiar topics.",
    upper_intermediate:
      "You speak confidently on complex topics and work on accuracy and nuance.",
    advanced:
      "You communicate fluently in professional and academic settings with fine control.",
  };

  var TRACK_META = {
    general: {
      title: "General English",
      description:
        "Build everyday English step by step — from first phrases to confident conversation.",
      cefrRange: "A1–C2",
      levelIds: [
        "beginner",
        "elementary",
        "pre_intermediate",
        "intermediate",
        "upper_intermediate",
        "advanced",
      ],
    },
    business: {
      title: "Business English",
      description:
        "English for meetings, emails, presentations, and professional relationships.",
      cefrRange: "B1–C2",
      levelIds: ["intermediate", "upper_intermediate", "advanced"],
    },
  };

  var state = {
    step: 1,
    selectedOptionId: null,
    selectedLevelId: null,
    changeMode: false,
    required: false,
    levels: {},
    catalog: [],
    onEnrolled: null,
    esc: function (s) {
      return String(s || "");
    },
  };

  function buildOnboardingOptions(catalog) {
    var options = [];
    var track;

    ["general", "business"].forEach(function (category) {
      track = TRACK_META[category];
      if (!track) return;
      options.push({
        id: "track-" + category,
        kind: "track",
        category: category,
        title: track.title,
        description: track.description,
        cefrRange: track.cefrRange,
        levelIds: track.levelIds.slice(),
      });
    });

    (catalog || []).forEach(function (program) {
      if (program.category !== "special") return;
      var level = state.levels[program.levelId] || {};
      options.push({
        id: program.id,
        kind: "special",
        category: "special",
        title: program.title,
        description: program.description,
        cefrRange: level.cefr || program.levelId,
        levelIds: [program.levelId],
        catalogProgramId: program.id,
      });
    });

    return options;
  }

  function getOptionById(optionId) {
    var options = buildOnboardingOptions(state.catalog);
    for (var i = 0; i < options.length; i += 1) {
      if (options[i].id === optionId) return options[i];
    }
    return null;
  }

  function resolveCatalogProgramId(option, levelId) {
    if (!option) return null;
    if (option.kind === "special") return option.catalogProgramId;
    return option.category + "-" + String(levelId).replace(/_/g, "-");
  }

  function parseCatalogProgramId(programId) {
    var program = null;
    for (var i = 0; i < state.catalog.length; i += 1) {
      if (state.catalog[i].id === programId) {
        program = state.catalog[i];
        break;
      }
    }
    if (!program) return null;

    if (program.category === "special") {
      return {
        optionId: program.id,
        levelId: program.levelId,
        step: 2,
      };
    }

    return {
      optionId: "track-" + program.category,
      levelId: program.levelId,
      step: 2,
    };
  }

  function showToast(message) {
    var existing = document.getElementById("enrollment-toast");
    if (existing) existing.remove();

    var toast = document.createElement("div");
    toast.id = "enrollment-toast";
    toast.className = "enrollment-toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });

    window.setTimeout(function () {
      toast.classList.remove("is-visible");
      window.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 4500);
  }

  function getOverlay() {
    return document.getElementById("program-onboarding-overlay");
  }

  function renderStep1(container) {
    var options = buildOnboardingOptions(state.catalog);
    container.innerHTML =
      '<div class="onboarding-step" data-step="1">' +
      '<h2 class="onboarding-title">Choose your program</h2>' +
      '<p class="onboarding-subtitle">You know your level best — pick the program that matches your goals.</p>' +
      (state.changeMode
        ? '<div class="onboarding-change-warning" role="alert">' +
          "<strong>Changing your program will reset your class progress.</strong> " +
          "Completed lessons stay in your history, but the curriculum list will change. Continue?" +
          "</div>"
        : "") +
      '<div class="onboarding-program-list">' +
      options
        .map(function (option) {
          var selected = option.id === state.selectedOptionId;
          return (
            '<button type="button" class="onboarding-program-card' +
            (selected ? " is-selected" : "") +
            '" data-option-id="' +
            state.esc(option.id) +
            '">' +
            '<span class="onboarding-program-card-title">' +
            state.esc(option.title) +
            "</span>" +
            '<span class="onboarding-program-card-range">' +
            state.esc(option.cefrRange) +
            "</span>" +
            '<span class="onboarding-program-card-desc">' +
            state.esc(option.description) +
            "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="onboarding-actions">' +
      (state.required
        ? ""
        : '<button type="button" class="btn" id="onboarding-cancel">Cancel</button>') +
      '<button type="button" class="btn btn-primary" id="onboarding-continue" ' +
      (state.selectedOptionId ? "" : "disabled") +
      '>Continue</button>' +
      "</div>" +
      "</div>";
  }

  function renderStep2(container) {
    var option = getOptionById(state.selectedOptionId);
    if (!option) {
      state.step = 1;
      render();
      return;
    }

    var levelsHtml = option.levelIds
      .map(function (levelId) {
        var meta = state.levels[levelId] || {};
        var selected = levelId === state.selectedLevelId;
        var copy = LEVEL_COPY[levelId] || "";
        var cefrBadge = meta.cefr || levelId;
        return (
          '<button type="button" class="onboarding-level-row' +
          (selected ? " is-selected" : "") +
          '" data-level-id="' +
          state.esc(levelId) +
          '">' +
          '<span class="onboarding-level-cefr">' +
          state.esc(cefrBadge) +
          "</span>" +
          '<span class="onboarding-level-body">' +
          '<span class="onboarding-level-name">' +
          state.esc(meta.label || levelId) +
          "</span>" +
          '<span class="onboarding-level-desc">' +
          state.esc(copy) +
          "</span>" +
          "</span>" +
          "</button>"
        );
      })
      .join("");

    container.innerHTML =
      '<div class="onboarding-step" data-step="2">' +
      '<button type="button" class="onboarding-back" id="onboarding-back">← Back</button>' +
      '<h2 class="onboarding-title">Select your level</h2>' +
      '<p class="onboarding-subtitle">Choose the level you\'re starting from. You\'re responsible for this choice — pick honestly.</p>' +
      '<p class="onboarding-track-label">' +
      state.esc(option.title) +
      " · " +
      state.esc(option.cefrRange) +
      "</p>" +
      '<div class="onboarding-level-list">' +
      levelsHtml +
      "</div>" +
      '<div class="onboarding-actions onboarding-actions--stack">' +
      '<button type="button" class="btn btn-primary btn-block" id="onboarding-start" ' +
      (state.selectedLevelId ? "" : "disabled") +
      '>Start learning</button>' +
      '<p class="onboarding-disclaimer">You can change your level later in Settings if needed.</p>' +
      "</div>" +
      "</div>";
  }

  function render() {
    var overlay = getOverlay();
    var body = document.getElementById("program-onboarding-body");
    var closeBtn = document.getElementById("program-onboarding-close");
    if (!overlay || !body) return;

    if (closeBtn) closeBtn.hidden = !!state.required;

    if (state.step === 1) renderStep1(body);
    else renderStep2(body);

    bindStepEvents();
  }

  function bindStepEvents() {
    var overlay = getOverlay();
    if (!overlay) return;

    overlay.querySelectorAll(".onboarding-program-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.selectedOptionId = btn.dataset.optionId;
        state.selectedLevelId = null;
        render();
      });
    });

    var continueBtn = document.getElementById("onboarding-continue");
    if (continueBtn) {
      continueBtn.addEventListener("click", function () {
        if (!state.selectedOptionId) return;
        state.step = 2;
        var option = getOptionById(state.selectedOptionId);
        if (option && option.levelIds.length === 1) {
          state.selectedLevelId = option.levelIds[0];
        }
        render();
      });
    }

    overlay.querySelectorAll(".onboarding-level-row").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.selectedLevelId = btn.dataset.levelId;
        render();
      });
    });

    var backBtn = document.getElementById("onboarding-back");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        state.step = 1;
        render();
      });
    }

    var startBtn = document.getElementById("onboarding-start");
    if (startBtn) {
      startBtn.addEventListener("click", confirmEnrollment);
    }

    var cancelBtn = document.getElementById("onboarding-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", close);
    }
  }

  function confirmEnrollment() {
    var option = getOptionById(state.selectedOptionId);
    var levelId = state.selectedLevelId;
    if (!option || !levelId) return;

    var programId = resolveCatalogProgramId(option, levelId);
    var levelMeta = state.levels[levelId] || {};
    var ok = global.EnrollmentState.enroll({
      program_id: programId,
      level_id: levelId,
      level_cefr: levelMeta.cefr || levelId,
      level_name: levelMeta.label || levelId,
      student_confirmed: true,
      is_demo: true,
    });

    if (!ok) return;

    close();

    var label =
      (global.EnrollmentState.current.program_name || "Program") +
      " · " +
      (global.EnrollmentState.current.level_name || levelId);

    showToast("You're enrolled in " + label + ". Let's get started!");

    if (typeof state.onEnrolled === "function") {
      state.onEnrolled(global.EnrollmentState.current);
    }

    if (typeof global.setAppNavView === "function") {
      global.setAppNavView("home");
    }
  }

  function open(options) {
    options = options || {};
    state.step = options.step || 1;
    state.changeMode = !!options.changeMode;
    state.required = !!options.required;
    state.selectedOptionId = null;
    state.selectedLevelId = null;

    if (options.programId) {
      var parsed = parseCatalogProgramId(options.programId);
      if (parsed) {
        state.selectedOptionId = parsed.optionId;
        state.selectedLevelId = parsed.levelId;
        state.step = parsed.step || 2;
      }
    } else if (options.changeMode && global.EnrollmentState.isEnrolled()) {
      var current = global.EnrollmentState.current;
      var fromCurrent = parseCatalogProgramId(current.program_id);
      if (fromCurrent) {
        state.selectedOptionId = fromCurrent.optionId;
        state.selectedLevelId = fromCurrent.levelId;
      }
    }

    var overlay = getOverlay();
    if (!overlay) return;
    overlay.hidden = false;
    document.body.classList.add("onboarding-open");
    render();
  }

  function close() {
    if (state.required && !global.EnrollmentState.isEnrolled()) return;
    var overlay = getOverlay();
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("onboarding-open");
  }

  function init(config) {
    config = config || {};
    state.catalog = config.catalog || [];
    state.levels = config.levels || {};
    state.onEnrolled = config.onEnrolled || null;
    state.esc = config.esc || state.esc;

    var overlay = getOverlay();
    if (!overlay) return;

    var closeBtn = document.getElementById("program-onboarding-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", close);
    }

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay && !state.required) close();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.hidden && !state.required) close();
    });
  }

  global.ProgramOnboarding = {
    init: init,
    open: open,
    close: close,
    parseCatalogProgramId: parseCatalogProgramId,
    showToast: showToast,
  };
})(typeof window !== "undefined" ? window : this);
