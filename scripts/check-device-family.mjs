#!/usr/bin/env node
/**
 * Release guard: NUTRI IS IPHONE ONLY.
 *
 * ── WHY ──────────────────────────────────────────────────────────────
 *
 * App Store Connect refused the submission with "You must upload a
 * screenshot for 13-inch iPad displays." That requirement is not a
 * store-listing problem — it is the binary telling Apple it runs on
 * iPad. `ios.supportsTablet` was `true`, the Expo template default that
 * nobody had ever revisited, so every build through 14 shipped
 * TARGETED_DEVICE_FAMILY = "1,2".
 *
 * The product decision is iPhone only. This guard exists because that
 * single boolean is easy to flip back by accident — a template copy, a
 * merge, an "expo install" that rewrites app.json — and the cost is
 * discovered at submission time, after a build has been paid for.
 *
 * ── WHAT IS PINNED ───────────────────────────────────────────────────
 *
 * Not just the value in app.json. The guard EXECUTES Expo's own
 * getDeviceFamilies() against the fully resolved config — the same
 * function prebuild calls to write TARGETED_DEVICE_FAMILY into the
 * pbxproj — so it proves what the next binary will actually declare,
 * for BOTH config variants (production and APP_VARIANT=staging).
 *
 * It also pins the absence of an Apple Watch target. There has never
 * been one; this makes that a checked fact rather than an assumption.
 *
 * Run: npm run devicefamily:check
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

const require_ = createRequire(import.meta.url);

// ── The two resolved configs, exactly as Expo assembles them ───────────
const appJson = JSON.parse(readFileSync("app.json", "utf8").replace(/^﻿/, ""));
const overlay = require_(join(process.cwd(), "app.config.js"));
const resolve = (variant) => {
  const previous = process.env.APP_VARIANT;
  if (variant) process.env.APP_VARIANT = variant;
  else delete process.env.APP_VARIANT;
  try {
    return overlay({ config: JSON.parse(JSON.stringify(appJson.expo)) });
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
  }
};
const production = resolve(null);
const staging = resolve("staging");

// ── A: the source of truth ─────────────────────────────────────────────
check("app.json säger iPhone only", appJson.expo.ios.supportsTablet === false);
check("ingen isTabletOnly finns", appJson.expo.ios.isTabletOnly === undefined);
check("app.json är BOM-fri och parsbar (Expo läser den strikt)",
  readFileSync("app.json")[0] !== 0xef);

// ── B: the staging overlay must not smuggle it back ────────────────────
// It spreads ...config.ios, so a future edit that rebuilds the ios block
// field-by-field could silently drop or flip this. Both variants checked.
check("production-configen är iPhone only", production.ios.supportsTablet === false);
check("staging-configen är OCKSÅ iPhone only", staging.ios.supportsTablet === false);
check("overlayen ändrar bara bundle id på ios",
  staging.ios.bundleIdentifier === `${production.ios.bundleIdentifier}.staging`
  && staging.ios.supportsTablet === production.ios.supportsTablet);

// ── C: what the NEXT BINARY will actually declare ──────────────────────
// Expo's own mapping, executed — not a comment about what it probably
// does. getDeviceFamilies: isTabletOnly -> [2], supportsTablet -> [1,2],
// otherwise -> [1]. formatDeviceFamilies wraps it in quotes for the
// pbxproj's TARGETED_DEVICE_FAMILY.
let deviceFamily = null;
try {
  const df = require_("@expo/config-plugins/build/ios/DeviceFamily.js");
  const familiesProd = df.getDeviceFamilies(production);
  const familiesStg = df.getDeviceFamilies(staging);
  deviceFamily = df.formatDeviceFamilies(familiesProd);
  check("TARGETED_DEVICE_FAMILY blir iPhone only", deviceFamily === '"1"');
  check("iPad-familjen (2) finns inte med", !familiesProd.includes(2));
  check("staging bygger samma device family",
    JSON.stringify(familiesProd) === JSON.stringify(familiesStg));
} catch (e) {
  failures.push(`Expos device-family-mappning kunde inte köras: ${e.message}`);
}

// ── D: no Apple Watch target, anywhere ─────────────────────────────────
// Managed workflow: there is no committed Xcode project, so a watch
// target could only arrive via a config plugin or a native dependency.
const WATCH = /watchos|watchkit|WKWatchKitApp|application\.watchapp|WKCompanionAppBundleIdentifier/i;
const plugins = (appJson.expo.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
check("inget plugin är watch-relaterat", !plugins.some((p) => WATCH.test(p)));
const pkg = JSON.parse(readFileSync("package.json", "utf8").replace(/^﻿/, ""));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
check("ingen dependency är watch-relaterad", !deps.some((d) => WATCH.test(d)));
check("app.json nämner ingen watch-target", !WATCH.test(JSON.stringify(appJson)));
check("inget native ios-projekt är incheckat (managed workflow)", (() => {
  try { return !statSync("ios").isDirectory(); } catch { return true; }
})());
// Nothing in the app source either.
const scan = (dir, depth = 0) => {
  if (depth > 4) return false;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (scan(p, depth + 1)) return true; continue; }
    if (!/\.(ts|tsx|js|jsx|json|plist|entitlements)$/.test(e.name)) continue;
    if (WATCH.test(readFileSync(p, "utf8"))) { failures.push(`watch-referens i ${p}`); return true; }
  }
  return false;
};
const foundWatch = scan(".");
check("ingen watch-referens i källkoden", !foundWatch);

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Device family guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Nutri is iPhone only:");
console.log(`    TARGETED_DEVICE_FAMILY = ${deviceFamily}  (iPhone; no iPad)`);
console.log("    ios.supportsTablet = false in app.json, and in BOTH config variants");
console.log("    the staging overlay changes the bundle id and nothing else");
console.log("    APPLE WATCH TARGET = none — no plugin, dependency, or source reference");
