#!/usr/bin/env node
/**
 * Completeness check: every t("…") / data-i18n="…" key used in static UI
 * must exist in locales/ru.json (nested or flat).
 *
 * Usage: node scripts/check_i18n_keys.js
 * Exit 0 = ok, 1 = missing keys.
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var LOCALE_PATH = path.join(ROOT, "static", "locales", "ru.json");
var SCAN_GLOBS = [
  "static/dashboard.js",
  "static/dashboard.html",
  "static/curriculum-stages.js",
  "static/i18n.js",
];

function flattenKeys(obj, prefix, out) {
  out = out || [];
  Object.keys(obj || {}).forEach(function (key) {
    var full = prefix ? prefix + "." + key : key;
    var val = obj[key];
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      flattenKeys(val, full, out);
    } else {
      out.push(full);
    }
  });
  return out;
}

function lookup(dict, key) {
  if (!dict) return undefined;
  if (Object.prototype.hasOwnProperty.call(dict, key)) {
    var flat = dict[key];
    if (flat != null && typeof flat !== "object") return flat;
  }
  var parts = String(key).split(".");
  var cur = dict;
  for (var i = 0; i < parts.length; i += 1) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[parts[i]];
  }
  if (cur != null && typeof cur !== "object") return cur;
  return undefined;
}

function extractKeys(content) {
  var keys = new Set();
  var reT = /\bt\(\s*["']([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)["']/gi;
  var reData = /data-i18n(?:-aria)?=["']([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)["']/gi;
  var m;
  while ((m = reT.exec(content))) keys.add(m[1]);
  while ((m = reData.exec(content))) keys.add(m[1]);
  return keys;
}

function main() {
  var dict = JSON.parse(fs.readFileSync(LOCALE_PATH, "utf8"));
  var dictKeys = new Set(flattenKeys(dict));
  var used = new Set();

  SCAN_GLOBS.forEach(function (rel) {
    var full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return;
    extractKeys(fs.readFileSync(full, "utf8")).forEach(function (k) {
      used.add(k);
    });
  });

  var missing = [];
  used.forEach(function (key) {
    if (lookup(dict, key) == null) missing.push(key);
  });
  missing.sort();

  var unused = [];
  dictKeys.forEach(function (key) {
    if (!used.has(key)) unused.push(key);
  });
  unused.sort();

  console.log("i18n keys used:", used.size);
  console.log("ru.json leaf keys:", dictKeys.size);
  if (unused.length) {
    console.log("Unused in ru.json (ok, may be reserved):", unused.join(", "));
  }

  if (missing.length) {
    console.error("MISSING in locales/ru.json:");
    missing.forEach(function (k) {
      console.error("  -", k);
    });
    process.exit(1);
  }

  console.log("OK: all used keys present in locales/ru.json");
  process.exit(0);
}

main();
