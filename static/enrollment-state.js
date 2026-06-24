/**
 * EnrollmentState — явный выбор программы и уровня студентом (demo: localStorage).
 * Источник правды для StudentLearningContext.enrollment до API student_enrollments.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "english_agent_enrollment_v1";

  function findProgram(catalog, programId) {
    if (!catalog || !programId) return null;
    for (var i = 0; i < catalog.length; i += 1) {
      if (catalog[i].id === programId) return catalog[i];
    }
    return null;
  }

  var EnrollmentState = {
    current: null,
    _catalog: [],
    _levels: {},

    init: function (catalog, programLevels) {
      this._catalog = catalog || [];
      this._levels = programLevels || {};
      this.load();
      return this;
    },

    load: function () {
      try {
        var raw = global.localStorage.getItem(STORAGE_KEY);
        this.current = raw ? JSON.parse(raw) : null;
        if (this.current && !this.current.student_confirmed) {
          this.current = null;
        }
      } catch (err) {
        this.current = null;
      }
      return this.current;
    },

    save: function () {
      try {
        if (this.current) {
          global.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
        } else {
          global.localStorage.removeItem(STORAGE_KEY);
        }
      } catch (err) {
        console.warn("[Enrollment] Failed to persist enrollment:", err);
      }
    },

    isEnrolled: function () {
      return !!(this.current && this.current.student_confirmed && this.current.program_id);
    },

  /**
   * @param {object} data
   * @param {string} data.program_id — id из PROGRAM_CATALOG
   * @param {string} data.level_id — например "intermediate"
   * @param {string} data.level_cefr — например "B1"
   * @param {string} data.level_name — например "Intermediate"
   * @param {boolean} data.student_confirmed — обязательно true
   * @param {boolean} [data.is_demo]
   */
    enroll: function (data) {
      data = data || {};
      if (!data.student_confirmed) {
        console.warn(
          "[Enrollment] Attempted enrollment without student confirmation. Rejected."
        );
        return false;
      }

      var program = findProgram(this._catalog, data.program_id);
      if (!program) {
        console.warn("[Enrollment] Unknown programId:", data.program_id);
        return false;
      }

      if (!data.level_id || program.levelId !== data.level_id) {
        console.warn(
          "[Enrollment] level_id mismatch:",
          data.level_id,
          "for program:",
          data.program_id,
          "(expected",
          program.levelId + ")"
        );
        return false;
      }

      var levelMeta = this._levels[data.level_id];
      var levelCefr = data.level_cefr || (levelMeta ? levelMeta.cefr : null);
      var levelName = data.level_name || (levelMeta ? levelMeta.label : data.level_id);

      this.current = {
        program_id: data.program_id,
        level_id: data.level_id,
        level_cefr: levelCefr,
        level_name: levelName,
        program_name: program.title,
        track_category: program.category,
        enrolled_at: new Date().toISOString(),
        student_confirmed: true,
        is_demo: data.is_demo !== false,
      };

      this.save();
      console.log("[DEV] Enrollment confirmed by student:", this.current);
      return true;
    },

    clear: function () {
      this.current = null;
      this.save();
    },

    getProgramId: function () {
      return this.isEnrolled() ? this.current.program_id : null;
    },
  };

  global.EnrollmentState = EnrollmentState;
})(typeof window !== "undefined" ? window : this);
