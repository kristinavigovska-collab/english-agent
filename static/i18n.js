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

  function interpolate(template, vars) {
    if (template == null) return "";
    var out = String(template);
    if (!vars) return out;
    Object.keys(vars).forEach(function (key) {
      out = out.replace(new RegExp("\\{" + key + "\\}", "g"), String(vars[key]));
    });
    return out;
  }

  function t(key, vars) {
    var primary = nestedGet(dictionaries[currentLocale], key);
    if (primary == null && currentLocale !== DEFAULT_LOCALE) {
      primary = nestedGet(dictionaries[DEFAULT_LOCALE], key);
    }
    if (primary == null) return key;
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

  global.DashboardI18n = {
    init: init,
    t: t,
    getLocale: getLocale,
    setLocale: setLocale,
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    formatNumber: formatNumber,
    isReady: isReady,
    SUPPORTED: SUPPORTED,
    DEFAULT_LOCALE: DEFAULT_LOCALE,
  };

  global.t = t;
})(typeof window !== "undefined" ? window : this);
