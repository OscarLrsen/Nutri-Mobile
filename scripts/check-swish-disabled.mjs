#!/usr/bin/env node
/**
 * Release guard: Swish must be visible in checkout but unreachable.
 *
 * WHY THIS EXISTS. The Swish backend integration is built but switched off
 * (Swish__Enabled=false) and its transport is still unresolved. The app ships
 * with Swish shown as a "coming soon" teaser, and the one thing that must stay
 * true is that no customer can start a Swish payment from it. This is checked
 * mechanically because "the button is disabled" is easy to regress by adding a
 * handler, and nobody would notice until a customer hit a dead endpoint.
 *
 * Fails the build on any of:
 *   1. mobile code that calls /api/swish/*
 *   2. "swish" becoming an assignable PaymentMethod
 *   3. the checkout row losing its disabled flag
 *   4. missing or wrong coming-soon copy in any locale
 *
 * Run: npm run swish:check
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];

// ── 1. No call site may reference the Swish endpoints ───────────────────
const SKIP_DIRS = new Set(["node_modules", ".git", ".expo", "android", "ios", "dist", "scripts"]);
const CODE = /\.(ts|tsx|js|jsx)$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(root);
const endpointPattern = /["'`][^"'`]*\/api\/swish\/[^"'`]*["'`]|swish\/payments/i;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (endpointPattern.test(text)) {
    failures.push(`${relative(root, file)} references a Swish endpoint — the app must not be able to call one`);
  }
}

// ── 2. "swish" must not be an assignable payment method ─────────────────
const apiTypes = readFileSync(join(root, "types", "api.ts"), "utf8");
const paymentMethodLine = apiTypes.match(/export type PaymentMethod\s*=\s*([^;]+);/);
if (!paymentMethodLine) {
  failures.push("types/api.ts: could not find the PaymentMethod union");
} else if (/["']swish["']/.test(paymentMethodLine[1])) {
  failures.push('types/api.ts: PaymentMethod accepts "swish" — it must not be selectable');
}

// ── 3. The checkout row must stay disabled ──────────────────────────────
const cart = readFileSync(join(root, "features", "cart", "CartScreen.tsx"), "utf8");
const row = cart.match(/<PaymentRow[^>]*swishComingSoon[\s\S]{0,400}?\/>/);
if (!row) {
  failures.push("CartScreen.tsx: could not find the Swish PaymentRow");
} else {
  if (!/\bdisabled\b/.test(row[0])) failures.push("CartScreen.tsx: the Swish row is no longer disabled");
  if (!/onSelect=\{\(\)\s*=>\s*\{\}\}/.test(row[0]))
    failures.push("CartScreen.tsx: the Swish row has gained an onSelect handler");
  if (/selected=\{(?!false)/.test(row[0])) failures.push("CartScreen.tsx: the Swish row can become selected");
}

// ── 4. Copy must exist in every locale ──────────────────────────────────
const EXPECTED = {
  sv: "Swish kommer snart",
  en: "Swish coming soon",
  da: "Swish kommer snart",
};

for (const [locale, expected] of Object.entries(EXPECTED)) {
  const path = join(root, "i18n", "locales", `${locale}.json`);
  const actual = JSON.parse(readFileSync(path, "utf8"))?.checkout?.swishComingSoon;
  if (actual !== expected) {
    failures.push(`i18n/locales/${locale}.json: checkout.swishComingSoon is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// ── Report ──────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Swish release guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("✓ Swish is shown as a disabled teaser and cannot be invoked:");
console.log("    no /api/swish call site in the app");
console.log('    PaymentMethod cannot hold "swish"');
console.log("    checkout row is disabled with no handler");
console.log("    coming-soon copy present in sv, en and da");
