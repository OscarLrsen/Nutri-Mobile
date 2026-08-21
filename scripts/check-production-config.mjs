#!/usr/bin/env node
/**
 * PRODUCTION BUILD GATE.
 *
 * Fails if anything that ends up in a production build points at staging,
 * at a dev machine, or at the wrong app identity. This is the check that
 * stands between "we think the build is production" and knowing it.
 *
 * WHAT COUNTS AS A HIT. Only code. Comments are stripped before scanning,
 * because several files legitimately EXPLAIN the staging arrangement — the
 * signup screen says why a staging build cannot hand a confirmation to the
 * production app, and lib/env.ts documents the Expo Go localhost trap. A
 * guard that cannot tell an explanation from a configuration is a guard
 * that gets switched off.
 *
 * app.config.js is the one file allowed to name staging in code, because
 * naming it is its whole job: it overlays a different scheme, bundle id and
 * notification channel — and only when APP_VARIANT=staging. That gate is
 * itself asserted below, so the exemption cannot quietly widen.
 *
 * Run: npm run prodconfig:check
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

/** Source with comments removed — see WHAT COUNTS AS A HIT above. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── What must never reach a production build ────────────────────────────
const FORBIDDEN = [
  { label: "staging backend", re: /nutri-backend-staging/ },
  { label: "staging web", re: /nutri-frontend-staging/ },
  { label: "staging Supabase project", re: /lwhfjlhmkhmcajzurcpe/ },
  { label: "staging app scheme", re: /nutristaging/ },
  { label: "localhost", re: /localhost/ },
  { label: "loopback IP", re: /127\.0\.0\.1/ },
  { label: "LAN IP", re: /\b(?:192\.168|10\.0\.2\.2)\./ },
  // A QA password or token pasted into app code.
  { label: "hardcoded password", re: /password\s*[:=]\s*["'][^"']{4,}["']/i },
];

/** Directories whose contents are bundled into the app. */
const BUNDLED_DIRS = ["app", "components", "features", "services", "lib", "hooks", "i18n", "theme", "utils", "constants"];
const BUNDLED_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json"]);

/** app.config.js names staging on purpose; the gate below proves it is gated. */
const EXEMPT = new Set(["app.config.js"]);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (BUNDLED_EXT.has(extname(path))) out.push(path);
  }
  return out;
}

const bundled = BUNDLED_DIRS.flatMap((d) => walk(d));
for (const extra of ["app.json", "eas.json"]) bundled.push(extra);

let scanned = 0;
for (const file of bundled) {
  const rel = file.replace(/\\/g, "/");
  if (EXEMPT.has(rel)) continue;
  scanned++;
  const code = stripComments(readFileSync(file, "utf8"));
  for (const { label, re } of FORBIDDEN) {
    if (re.test(code)) {
      const line = code.split("\n").findIndex((l) => re.test(l)) + 1;
      failures.push(`${label} in ${rel}:${line}`);
    }
  }
}
check("something was actually scanned", scanned > 50);

// ── The staging overlay is gated, and only overlays identity ────────────
const appConfig = readFileSync("app.config.js", "utf8");
check("staging-overlayen körs BARA med APP_VARIANT=staging",
  /if \(process\.env\.APP_VARIANT !== "staging"\) return config;/.test(appConfig));
check("overlayen ändrar ingen backend-, Supabase- eller web-URL",
  !/EXPO_PUBLIC_API_URL|EXPO_PUBLIC_SUPABASE_URL|EXPO_PUBLIC_WEB_URL/.test(appConfig));

// ── App identity ────────────────────────────────────────────────────────
const app = JSON.parse(readFileSync("app.json", "utf8")).expo;
check("app scheme är nutri", app.scheme === "nutri");
check("iOS bundle id är com.nutrifoodtruck.app",
  app.ios?.bundleIdentifier === "com.nutrifoodtruck.app");
check("Android package är com.nutrifoodtruck.app",
  app.android?.package === "com.nutrifoodtruck.app");
check("appen heter Nutri", app.name === "Nutri");
const notif = (app.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "expo-notifications");
check("push-kanalen är default, inte staging", notif?.[1]?.defaultChannel === "default");
check("EAS-projektet är angivet", typeof app.extra?.eas?.projectId === "string");

// ── EAS build profiles ──────────────────────────────────────────────────
const eas = JSON.parse(readFileSync("eas.json", "utf8"));
const prod = eas.build?.production ?? {};
check("production-profilen sätter INTE APP_VARIANT",
  prod.env?.APP_VARIANT === undefined);
check("production-profilen använder ingen staging-kanal",
  prod.channel === undefined || prod.channel === "production");
check("production-profilen pekar inte på preview-miljön",
  prod.environment === undefined || prod.environment === "production");
check("build-numret räknas upp automatiskt", prod.autoIncrement === true);
check("versionen hanteras centralt", eas.cli?.appVersionSource === "remote");
check("App Store Connect-appen är namngiven för submit",
  typeof eas.submit?.production?.ios?.ascAppId === "string");

// ── Env plumbing ────────────────────────────────────────────────────────
const envTs = readFileSync("lib/env.ts", "utf8");
check("web-URL:ens default är production",
  /\.default\("https:\/\/www\.nutrifoodtruck\.com"\)/.test(envTs));
check("API-URL har ingen fallback alls (en saknad måste smälla)",
  !/EXPO_PUBLIC_API_URL[\s\S]{0,120}\.default\(/.test(envTs));
check("Supabase-URL har ingen fallback",
  !/EXPO_PUBLIC_SUPABASE_URL[\s\S]{0,120}\.default\(/.test(envTs));

// Local env files must not be able to travel into a build.
const gitignore = readFileSync(".gitignore", "utf8");
check(".env*.local är gitignorerad (annars kan den följa med till EAS)",
  /^\.env\*\.local$/m.test(gitignore) || /^\.env\.local$/m.test(gitignore));

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ PRODUCTION CONFIG GATE FAILED:\n");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nSTAGING REFERENCES IN PRODUCTION BUNDLE > 0 — do not build.");
  process.exit(1);
}
console.log("✓ Production config gate:");
console.log(`    ${scanned} bundled files scanned, 0 staging/local references in code`);
console.log("    scheme nutri · bundle com.nutrifoodtruck.app · channel default");
console.log("    staging overlay reachable only via APP_VARIANT=staging");
console.log("    production profile sets no APP_VARIANT and no staging channel");
console.log("    web URL defaults to https://www.nutrifoodtruck.com");
console.log("    STAGING REFERENCES IN PRODUCTION BUNDLE = 0");
