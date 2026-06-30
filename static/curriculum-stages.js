/**
 * Program stages — goal-oriented curriculum grouping.
 * A program is split into stages (default 4); each stage has 1–8 lessons.
 * Stage defs: program.stages[] or auto-split from program.classes count.
 */
(function (global) {
  "use strict";

  var DEFAULT_STAGE_COUNT = 4;
  var DEFAULT_STAGE_TITLES = [
    "Основы общения",
    "Митинги и переговоры",
    "Презентации и выступления",
    "Закрепление",
  ];

  function resolveStageDefinitions(program, totalClasses) {
    var total = Math.max(0, Number(totalClasses) || 0);
    if (!total) return [];

    if (program && program.stages && program.stages.length) {
      var defs = program.stages.map(function (stage, index) {
        return {
          id: stage.id != null ? stage.id : index + 1,
          title: stage.title || "Этап " + (index + 1),
          lesson_count: Math.max(1, Number(stage.lesson_count || stage.lessons) || 1),
        };
      });
      var sum = defs.reduce(function (acc, stage) {
        return acc + stage.lesson_count;
      }, 0);
      if (sum !== total && defs.length) {
        defs[defs.length - 1].lesson_count += total - sum;
        if (defs[defs.length - 1].lesson_count < 1) {
          defs[defs.length - 1].lesson_count = 1;
        }
      }
      return defs;
    }

    var count = Math.min(DEFAULT_STAGE_COUNT, total);
    var base = Math.floor(total / count);
    var remainder = total % count;
    var stages = [];
    var assigned = 0;

    for (var i = 0; i < count; i += 1) {
      var lessons = base + (i < remainder ? 1 : 0);
      if (lessons < 1) lessons = 1;
      assigned += lessons;
      stages.push({
        id: i + 1,
        title: DEFAULT_STAGE_TITLES[i] || "Этап " + (i + 1),
        lesson_count: lessons,
      });
    }

    if (assigned !== total && stages.length) {
      stages[stages.length - 1].lesson_count += total - assigned;
    }

    return stages;
  }

  function lessonTopicsLabel(startNum, endNum) {
    if (!startNum || !endNum) return "";
    if (startNum === endNum) return "Тема " + startNum;
    return "Темы " + startNum + "–" + endNum;
  }

  function countStageCompleted(lessons) {
    var count = 0;
    (lessons || []).forEach(function (item) {
      if (item.lessonCompleted) count += 1;
    });
    return count;
  }

  function isStageFullyComplete(lessons) {
    if (!lessons || !lessons.length) return false;
    return lessons.every(function (item) {
      return item.completed;
    });
  }

  function applyStageStatuses(stages) {
    var currentIdx = -1;
    for (var i = 0; i < stages.length; i += 1) {
      if (!isStageFullyComplete(stages[i].lessons)) {
        currentIdx = i;
        break;
      }
    }

    stages.forEach(function (stage, index) {
      if (isStageFullyComplete(stage.lessons)) {
        stage.status = "completed";
      } else if (index === currentIdx) {
        stage.status = "current";
      } else {
        stage.status = "future";
      }
    });

    return stages;
  }

  /**
   * @param {object|null} program — catalog program
   * @param {Array} items — curriculum class items (classNum, title, flags…)
   */
  function buildProgramStages(program, items) {
    items = items || [];
    var total = items.length || (program ? Number(program.classes) || 0 : 0);
    var defs = resolveStageDefinitions(program, total);
    if (!defs.length) return [];

    var byClassNum = {};
    items.forEach(function (item) {
      byClassNum[item.classNum] = item;
    });

    var stages = [];
    var classNum = 1;

    defs.forEach(function (def, index) {
      var lessons = [];
      for (var j = 0; j < def.lesson_count && classNum <= total; j += 1) {
        var existing = byClassNum[classNum];
        lessons.push(
          existing || {
            classNum: classNum,
            class_index: classNum - 1,
            title: "Урок " + classNum,
            lessonCompleted: false,
            practiceCompleted: false,
            completed: false,
            isCurrent: false,
            isNext: false,
          }
        );
        classNum += 1;
      }

      var startNum = lessons[0] ? lessons[0].classNum : null;
      var endNum = lessons[lessons.length - 1] ? lessons[lessons.length - 1].classNum : null;

      stages.push({
        id: def.id,
        index: index,
        title: def.title,
        topicsLabel: lessonTopicsLabel(startNum, endNum),
        startClassNum: startNum,
        endClassNum: endNum,
        lessonCount: lessons.length,
        completedCount: countStageCompleted(lessons),
        lessons: lessons,
        status: "future",
      });
    });

    return applyStageStatuses(stages);
  }

  function findStageForClassNum(stages, classNum) {
    if (!stages || !classNum) return null;
    for (var i = 0; i < stages.length; i += 1) {
      var stage = stages[i];
      if (
        classNum >= stage.startClassNum &&
        classNum <= stage.endClassNum
      ) {
        return stage;
      }
    }
    return null;
  }

  function getCurrentStage(stages) {
    if (!stages || !stages.length) return null;
    return (
      stages.find(function (stage) {
        return stage.status === "current";
      }) || stages[stages.length - 1]
    );
  }

  global.EnglishAgentStages = {
    build: buildProgramStages,
    findStageForClassNum: findStageForClassNum,
    getCurrentStage: getCurrentStage,
    lessonTopicsLabel: lessonTopicsLabel,
  };
})(typeof window !== "undefined" ? window : this);
