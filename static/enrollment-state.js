/**
 * EnrollmentState — программы студента (demo: localStorage; live: sync с API).
 * Поддерживает несколько программ и активную программу для дашборда.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "english_agent_enrollments_v1";
  var LEGACY_KEY = "english_agent_enrollment_v1";
  var ACTIVE_KEY = "english_agent_active_program_id";

  function findProgram(catalog, programId) {
    if (!catalog || !programId) return null;
    for (var i = 0; i < catalog.length; i += 1) {
      if (catalog[i].id === programId) return catalog[i];
    }
    return null;
  }

  function normalizeRecord(record) {
    if (!record || !record.program_id || !record.student_confirmed) return null;
    return record;
  }

  var EnrollmentState = {
    current: null,
    enrollments: [],
    activeProgramId: null,
    _catalog: [],
    _levels: {},

    init: function (catalog, programLevels) {
      this._catalog = catalog || [];
      this._levels = programLevels || {};
      this.load();
      return this;
    },

    load: function () {
      this.enrollments = [];
      this.activeProgramId = null;
      this.current = null;

      try {
        var raw = global.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.enrollments = parsed.map(normalizeRecord).filter(Boolean);
          }
        }
      } catch (err) {
        this.enrollments = [];
      }

      if (!this.enrollments.length) {
        try {
          var legacyRaw = global.localStorage.getItem(LEGACY_KEY);
          if (legacyRaw) {
            var legacy = normalizeRecord(JSON.parse(legacyRaw));
            if (legacy) this.enrollments = [legacy];
          }
        } catch (errLegacy) {
          /* ignore */
        }
      }

      try {
        this.activeProgramId = global.localStorage.getItem(ACTIVE_KEY) || null;
      } catch (errActive) {
        this.activeProgramId = null;
      }

      if (!this.activeProgramId && this.enrollments.length) {
        this.activeProgramId = this.enrollments[0].program_id;
      }

      if (
        this.activeProgramId &&
        !this.enrollments.some(function (item) {
          return item.program_id === this.activeProgramId;
        }, this)
      ) {
        this.activeProgramId = this.enrollments.length
          ? this.enrollments[0].program_id
          : null;
      }

      this._syncCurrent();
      return this.getActive();
    },

    save: function () {
      try {
        if (this.enrollments.length) {
          global.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.enrollments));
        } else {
          global.localStorage.removeItem(STORAGE_KEY);
        }
        if (this.activeProgramId) {
          global.localStorage.setItem(ACTIVE_KEY, this.activeProgramId);
        } else {
          global.localStorage.removeItem(ACTIVE_KEY);
        }
        global.localStorage.removeItem(LEGACY_KEY);
      } catch (err) {
        console.warn("[Enrollment] Failed to persist enrollment:", err);
      }
      this._syncCurrent();
    },

    _syncCurrent: function () {
      this.current = this.getActive();
    },

    list: function () {
      return this.enrollments.slice();
    },

    getActive: function () {
      if (!this.enrollments.length) return null;
      var activeId = this.activeProgramId || this.enrollments[0].program_id;
      for (var i = 0; i < this.enrollments.length; i += 1) {
        if (this.enrollments[i].program_id === activeId) {
          return this.enrollments[i];
        }
      }
      return this.enrollments[0];
    },

    setActive: function (programId) {
      if (!programId) return false;
      var found = this.enrollments.some(function (item) {
        return item.program_id === programId;
      });
      if (!found) return false;
      this.activeProgramId = programId;
      this.save();
      return true;
    },

    isEnrolled: function () {
      return this.enrollments.length > 0;
    },

    hasMultiple: function () {
      return this.enrollments.length > 1;
    },

    /**
     * @param {object} data
     * @param {string} data.program_id
     * @param {string} data.level_id
     * @param {string} [data.plan_id]
     * @param {boolean} data.student_confirmed
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

      var record = {
        program_id: data.program_id,
        level_id: data.level_id,
        level_cefr: levelCefr,
        level_name: levelName,
        program_name: program.title,
        track_category: program.category,
        plan_id: data.plan_id || null,
        enrolled_at: data.enrolled_at || new Date().toISOString(),
        student_confirmed: true,
        is_demo: data.is_demo !== false,
      };

      var existingIdx = -1;
      for (var i = 0; i < this.enrollments.length; i += 1) {
        if (this.enrollments[i].program_id === data.program_id) {
          existingIdx = i;
          break;
        }
      }

      if (existingIdx >= 0) {
        record.enrolled_at = this.enrollments[existingIdx].enrolled_at || record.enrolled_at;
        this.enrollments[existingIdx] = record;
      } else {
        this.enrollments.push(record);
      }

      this.activeProgramId = data.program_id;
      this.save();
      console.log("[DEV] Enrollment confirmed by student:", record);
      return true;
    },

    clear: function () {
      this.enrollments = [];
      this.activeProgramId = null;
      this.save();
    },

    getProgramId: function () {
      var active = this.getActive();
      return active ? active.program_id : null;
    },
  };

  global.EnrollmentState = EnrollmentState;
})(typeof window !== "undefined" ? window : this);
