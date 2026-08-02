/**
 * ADR-001: StudentLearningContext — единый источник правды для дашборда
 * ========================================================================
 *
 * Проблема: три несвязанных источника (goal в Supabase, каталог программ с API,
 * PLACEHOLDER_CEFR_CURRICULUM) притворялись одной системой.
 *
 * Решение — явное разделение ответственности:
 *
 * a) Сайдбар «Программа обучения» (curriculum.classes)
 *    Строится ОТ ПРОГРАММЫ: programCatalog[enrollment.program_id].classes (число Class).
 *    НЕ от goal.target_duration_weeks. Количество Class = программа, не срок цели.
 *
 * b) Блок «Цель и план» (goal + computed.hours_per_week_needed, pace_status)
 *    Строится ОТ ЦЕЛИ студента (target_cefr_level, target_date / target_duration_weeks).
 *    Это намерение студента, отдельно от содержания программы.
 *
 * c) Связь goal ↔ program
 *    Прогноз ETA (computed.goal_eta_date) — функция от темпа прохождения Class программы
 *    (enrollment.plan_tier → classes/week). program.classes — вход для ETA, не наоборот.
 *
 * Enrollment: явный выбор студента на странице Programs → EnrollmentState.
 * Без автоматических рекомендаций и placeholder по CEFR.
 *
 * PLACEHOLDER_CEFR_CURRICULUM в dashboard.js — DEPRECATED, не использовать для сайдбара.
 */
(function (global) {
  "use strict";

  var PLAN_LIVE_CLASSES_PER_WEEK = {
    free_trial: 1,
    solo: 0,
    light: 1,
    standard: 2,
    intensive: 4,
  };

  var VALID_PLAN_TIERS = ["free_trial", "solo", "light", "standard", "intensive"];

  function isoDateOnly(value) {
    if (!value) return null;
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  function parseIsoDate(value) {
    var iso = isoDateOnly(value);
    if (!iso) return null;
    var parts = iso.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function findProgram(catalog, programId) {
    if (!catalog || !programId) return null;
    for (var i = 0; i < catalog.length; i += 1) {
      if (catalog[i].id === programId) return catalog[i];
    }
    return null;
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

  function getProgramLevelLabel(programLevels, levelId) {
    var level = programLevels && programLevels[levelId];
    if (!level) return levelId || "—";
    return level.label + " (" + level.cefr + ")";
  }

  function resolveCurrentCefr(input) {
    if (input.currentCefr) return String(input.currentCefr).toUpperCase();
    var reports = input.reports || [];
    if (!reports.length) return null;
    var sorted = reports.slice().sort(function (a, b) {
      return new Date(a.lesson_date || a.created_at || 0) -
        new Date(b.lesson_date || b.created_at || 0);
    });
    var latest = sorted[sorted.length - 1];
    return latest && latest.vocabulary_level
      ? String(latest.vocabulary_level).toUpperCase()
      : null;
  }

  /**
   * @deprecated — не используется после EnrollmentState; оставлено для совместимости импорта.
   */
  function resolvePlaceholderProgramId(input) {
    var goal = input.goal || {};
    var currentCefr = resolveCurrentCefr(input);
    var levelId = cefrToProgramLevel(currentCefr || goal.goal_start_cefr_level);
    if (!levelId) return null;

    if (goal.goal_type === "scenario_based") {
      var catalog = input.programCatalog || [];
      for (var i = 0; i < catalog.length; i += 1) {
        var program = catalog[i];
        if (program.category === "special" && program.levelId === levelId) {
          return program.id;
        }
      }
    }
    var fallbackCatalog = input.programCatalog || [];
    for (var j = 0; j < fallbackCatalog.length; j += 1) {
      if (fallbackCatalog[j].category === "special") {
        return fallbackCatalog[j].id;
      }
    }
    return "special-negotiations";
  }

  function normalizePlanTier(planId) {
    if (!planId) return "standard";
    var key = String(planId).trim();
    return VALID_PLAN_TIERS.indexOf(key) >= 0 ? key : "standard";
  }

  function buildEnrollmentFromRecord(record, program, input) {
    var programLevels = input.programLevels || {};
    var planTier = normalizePlanTier(record.plan_id || input.enrolledPlanId);
    var levelLabel =
      record.level_name && record.level_cefr
        ? record.level_name + " (" + record.level_cefr + ")"
        : getProgramLevelLabel(programLevels, program.levelId);

    return {
      program_id: record.program_id,
      program_name: record.program_name || program.title,
      program_level: levelLabel,
      level_id: record.level_id,
      level_cefr: record.level_cefr,
      level_name: record.level_name,
      plan_tier: planTier,
      enrolled_at: record.enrolled_at,
      student_confirmed: true,
      is_placeholder: false,
      program_classes_count: Number(program.classes) || 0,
      program_weeks: Number(program.weeks) || 0,
    };
  }

  function resolveEnrollment(input) {
    var catalog = input.programCatalog || [];
    var record = input.enrollmentRecord || null;

    if (!record || !record.student_confirmed || !record.program_id) {
      return null;
    }

    var program = findProgram(catalog, record.program_id);
    if (!program) {
      console.warn(
        "[StudentLearningContext] Enrollment program_id not in catalog:",
        record.program_id
      );
      return null;
    }

    return buildEnrollmentFromRecord(record, program, input);
  }

  /**
   * Темы Class — из program.tags (циклично), не из PLACEHOLDER_CEFR_CURRICULUM.
   */
  function buildClassTitlesForProgram(program, classCount) {
    var explicit =
      program.lesson_titles && program.lesson_titles.length
        ? program.lesson_titles.slice()
        : null;
    var tags = program.tags && program.tags.length ? program.tags.slice() : ["Практика"];
    var titles = [];
    var i;

    for (i = 0; i < classCount; i += 1) {
      if (explicit && explicit[i]) {
        titles.push(explicit[i]);
      } else {
        titles.push(tags[i % tags.length]);
      }
    }
    return titles;
  }

  function buildCurriculumSkeleton(program) {
    if (!program) return null;

    var totalClasses = Math.max(0, Number(program.classes) || 0);
    if (!totalClasses) return null;

    var titles = buildClassTitlesForProgram(program, totalClasses);
    var classes = titles.map(function (title, index) {
      return {
        class_index: index,
        classNum: index + 1,
        title: title,
        program_id: program.id,
        lessonCompleted: false,
        practiceCompleted: false,
        completed: false,
        isCurrent: false,
        isNext: false,
        practiceProgressPercent: 0,
        lessonReportId: null,
        lessonDateIso: null,
        hasProgress: false,
      };
    });

    return {
      program_id: program.id,
      total_classes: totalClasses,
      current_class_index: 0,
      completed_classes: [],
      classes: classes,
    };
  }

  function classesPerWeekFromPlan(planTier) {
    return PLAN_LIVE_CLASSES_PER_WEEK[planTier] != null
      ? PLAN_LIVE_CLASSES_PER_WEEK[planTier]
      : PLAN_LIVE_CLASSES_PER_WEEK.standard;
  }

  function countCompletedClasses(curriculumItems) {
    if (!curriculumItems || !curriculumItems.length) return 0;
    var count = 0;
    curriculumItems.forEach(function (item) {
      if (item.lessonCompleted) count += 1;
    });
    return count;
  }

  function computeGoalEta(enrollment, curriculumItems, goal) {
    if (!enrollment || !curriculumItems || !curriculumItems.length) {
      return { goal_eta_date: null, goal_eta_confidence_weeks: null };
    }

    var total = curriculumItems.length;
    var completed = countCompletedClasses(curriculumItems);
    var remaining = Math.max(0, total - completed);
    var classesPerWeek = classesPerWeekFromPlan(enrollment.plan_tier);

    if (classesPerWeek <= 0 || remaining === 0) {
      return {
        goal_eta_date: goal && goal.target_date ? goal.target_date : null,
        goal_eta_confidence_weeks: 0,
      };
    }

    var weeksNeeded = Math.ceil(remaining / classesPerWeek);
    var eta = new Date();
    eta.setHours(0, 0, 0, 0);
    eta.setDate(eta.getDate() + weeksNeeded * 7);

    return {
      goal_eta_date: isoDateOnly(eta),
      goal_eta_confidence_weeks: weeksNeeded,
    };
  }

  function buildComputed(enrollment, curriculumItems, studyPlan, goal) {
    var eta = computeGoalEta(enrollment, curriculumItems, goal);
    var plan = studyPlan || {};

    return {
      hours_per_week_needed: plan.hours_per_week != null ? plan.hours_per_week : null,
      goal_eta_date: eta.goal_eta_date,
      goal_eta_confidence_weeks: eta.goal_eta_confidence_weeks,
      pace_status: plan.status || "on_track",
      completed_hours: plan.hours_completed != null ? plan.hours_completed : 0,
      total_hours_estimated: plan.total_hours != null ? plan.total_hours : 0,
      program_classes_completed: countCompletedClasses(curriculumItems),
      program_classes_total: curriculumItems ? curriculumItems.length : 0,
    };
  }

  function buildStudentLearningContext(input) {
    input = input || {};
    var goal = input.goal || {};
    var enrollment = resolveEnrollment(input);
    var program = enrollment
      ? findProgram(input.programCatalog || [], enrollment.program_id)
      : null;
    var curriculum = program ? buildCurriculumSkeleton(program) : null;
    var currentCefr = resolveCurrentCefr(input);

    var ctx = {
      student_id: input.studentId || "",
      current_cefr_level: currentCefr,
      target_cefr_level: goal.target_cefr_level || null,
      goal_type: goal.goal_type || "general_level",
      scenario_description: goal.scenario_description || goal.goal_label || null,
      target_date: goal.target_date || null,
      target_duration_weeks: goal.target_duration_weeks != null
        ? Number(goal.target_duration_weeks)
        : null,
      intensity_preset: goal.study_intensity_preset || null,
      enrollment: enrollment,
      curriculum: curriculum,
      computed: buildComputed(enrollment, curriculum ? curriculum.classes : [], input.studyPlan, goal),
      _meta: {
        built_at: new Date().toISOString(),
        adr: "ADR-001",
      },
    };

    return ctx;
  }

  /**
   * После applyCurriculumCompletions в dashboard.js — обновить computed и curriculum metadata.
   */
  function syncComputedFromCurriculum(ctx, curriculumItems, studyPlan, goal) {
    if (!ctx) return ctx;

    var completed = [];
    var currentIndex = 0;

    (curriculumItems || []).forEach(function (item, idx) {
      if (item.lessonCompleted) {
        completed.push({
          class_index: item.class_index != null ? item.class_index : idx,
          classNum: item.classNum,
          title: item.title,
          lesson_date: item.lessonDateIso || null,
        });
      }
      if (item.isCurrent) {
        currentIndex = item.class_index != null ? item.class_index : idx;
      }
    });

    if (ctx.curriculum) {
      ctx.curriculum.current_class_index = currentIndex;
      ctx.curriculum.completed_classes = completed;
      ctx.curriculum.total_classes = curriculumItems ? curriculumItems.length : 0;
    }

    ctx.computed = buildComputed(ctx.enrollment, curriculumItems, studyPlan, goal);
    return ctx;
  }

  function validateStudentLearningContext(ctx, options) {
    options = options || {};
    var catalog = options.programCatalog || [];
    var warnings = [];

    if (!ctx) {
      warnings.push("StudentLearningContext is null or undefined");
      logWarnings(warnings);
      return warnings;
    }

    if (ctx.enrollment !== null && ctx.curriculum === null) {
      warnings.push(
        "enrollment is set (program_id=" +
          ctx.enrollment.program_id +
          ") but curriculum is null"
      );
    }

    if (ctx.curriculum !== null && ctx.enrollment !== null) {
      var program = findProgram(catalog, ctx.enrollment.program_id);
      var expected = program ? Number(program.classes) : null;
      if (expected != null && ctx.curriculum.total_classes !== expected) {
        warnings.push(
          "curriculum.total_classes (" +
            ctx.curriculum.total_classes +
            ") !== program catalog[" +
            ctx.enrollment.program_id +
            "].classes (" +
            expected +
            ")"
        );
      }
    }

    if (ctx.computed && ctx.computed.goal_eta_date && !ctx.enrollment) {
      warnings.push(
        "computed.goal_eta_date is set but enrollment is null — ETA requires a program"
      );
    }

    if (ctx.enrollment && !findProgram(catalog, ctx.enrollment.program_id)) {
      warnings.push(
        "enrollment.program_id '" +
          ctx.enrollment.program_id +
          "' not found in program catalog"
      );
    }

    logWarnings(warnings);
    return warnings;
  }

  function logWarnings(warnings) {
    if (!warnings.length) return;
    warnings.forEach(function (message) {
      console.warn("[StudentLearningContext] " + message);
    });
  }

  global.EnglishAgentSLC = {
    ADR_ID: "ADR-001",
    build: buildStudentLearningContext,
    syncComputed: syncComputedFromCurriculum,
    validate: validateStudentLearningContext,
    classesPerWeekFromPlan: classesPerWeekFromPlan,
    findProgram: findProgram,
  };
})(typeof window !== "undefined" ? window : this);
