/**
 * Lightweight i18n for the participant dashboard.
 * Locales: ru (default, filled), en/pt/pl (empty stubs → fallback to ru).
 * Lesson/module titles are learning content — do not put them in dictionaries.
 */
(function (global) {
  "use strict";

  var DEFAULT_LOCALE = "ru";
  var SUPPORTED = ["ru", "en", "pt", "pl"];
  var dictionaries = Object.create(null);
  var currentLocale = DEFAULT_LOCALE;
  var ready = false;
  var readyPromise = null;
  var warnedKeys = Object.create(null);

  function nestedGet(obj, path) {
    if (!obj || !path) return undefined;
    var parts = String(path).split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i += 1) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function lookup(dict, key) {
    if (!dict) return undefined;
    var nested = nestedGet(dict, key);
    if (nested != null && typeof nested !== "object") return nested;
    // Flat-key fallback for legacy dictionaries.
    if (Object.prototype.hasOwnProperty.call(dict, key)) {
      var flat = dict[key];
      if (flat != null && typeof flat !== "object") return flat;
    }
    return undefined;
  }

  function interpolate(template, vars) {
    if (template == null) return "";
    var out = String(template);
    if (!vars) return out;
    Object.keys(vars).forEach(function (key) {
      out = out.replace(new RegExp("\\{" + key + "\\}", "g"), String(vars[key]));
    });
    return out;
  }

  function humanizeKey(key) {
    var parts = String(key).split(".");
    var last = parts[parts.length - 1] || String(key);
    return last.replace(/_/g, " ");
  }

  function warnMissing(key) {
    if (warnedKeys[key]) return;
    warnedKeys[key] = true;
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("[i18n] missing key:", key);
    }
  }

  function t(key, vars) {
    var primary = lookup(dictionaries[currentLocale], key);
    if (primary == null && currentLocale !== DEFAULT_LOCALE) {
      primary = lookup(dictionaries[DEFAULT_LOCALE], key);
    }
    if (primary == null) {
      warnMissing(key);
      return humanizeKey(key);
    }
    return interpolate(primary, vars);
  }

  function getLocale() {
    return currentLocale;
  }

  function setLocale(locale) {
    if (SUPPORTED.indexOf(locale) >= 0) currentLocale = locale;
    else currentLocale = DEFAULT_LOCALE;
    try {
      document.documentElement.lang = currentLocale;
    } catch (err) {}
    return currentLocale;
  }

  function formatDate(value, options) {
    if (!value) return "";
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(currentLocale, options || {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  }

  function formatDateShort(value) {
    return formatDate(value, { day: "numeric", month: "short", year: "numeric" });
  }

  function formatNumber(value, options) {
    if (value == null || value === "") return "";
    var n = Number(value);
    if (isNaN(n)) return String(value);
    return new Intl.NumberFormat(currentLocale, options || {}).format(n);
  }

  function loadLocale(locale) {
    var url = "/static/locales/" + locale + ".json";
    return fetch(url)
      .then(function (res) {
        if (!res.ok) return {};
        return res.json();
      })
      .then(function (data) {
        dictionaries[locale] = data && typeof data === "object" ? data : {};
      })
      .catch(function () {
        dictionaries[locale] = {};
      });
  }

  function init(preferredLocale) {
    if (readyPromise) return readyPromise;
    if (preferredLocale) setLocale(preferredLocale);
    readyPromise = Promise.all(
      SUPPORTED.map(function (locale) {
        return loadLocale(locale);
      })
    ).then(function () {
      ready = true;
      return currentLocale;
    });
    return readyPromise;
  }

  function isReady() {
    return ready;
  }

  /** Test helper: resolve a key against an in-memory dict (Node / unit tests). */
  function hasKey(dict, key) {
    return lookup(dict, key) != null;
  }

  global.DashboardI18n = {
    init: init,
    t: t,
    getLocale: getLocale,
    setLocale: setLocale,
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    formatNumber: formatNumber,
    isReady: isReady,
    hasKey: hasKey,
    SUPPORTED: SUPPORTED,
    DEFAULT_LOCALE: DEFAULT_LOCALE,
  };

  global.t = t;
})(typeof window !== "undefined" ? window : this);
