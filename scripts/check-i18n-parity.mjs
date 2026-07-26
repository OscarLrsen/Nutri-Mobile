#!/usr/bin/env node
/**
 * i18n key-parity check.
 *
 * Fails (exit code 1) if sv / en / da do not share EXACTLY the same nested key
 * structure — i.e. any key missing from a locale, or any extra key a locale
 * has that Swedish does not. Values are ignored; only the key shape matters.
 * Swedish (sv) is the source-of-truth key set.
 *
 * Run via `npm run i18n:check`. Wire this into CI so a drifted locale fails
 * the build.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, "..", "i18n", "locales");

const LOCALES = ["sv", "en", "da"];
const REFERENCE = "sv";

function loadLocale(code) {
  return JSON.parse(readFileSync(join(localesDir, `${code}.json`), "utf8"));
}

/** Flatten a nested dictionary to a sorted list of dotted leaf paths. */
function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const referenceKeys = new Set(flattenKeys(loadLocale(REFERENCE)));
let hasError = false;

for (const code of LOCALES) {
  if (code === REFERENCE) continue;

  const localeKeys = new Set(flattenKeys(loadLocale(code)));
  const missing = [...referenceKeys].filter((k) => !localeKeys.has(k)).sort();
  const extra = [...localeKeys].filter((k) => !referenceKeys.has(k)).sort();

  if (missing.length || extra.length) {
    hasError = true;
    console.error(`\n✖ Locale "${code}" differs from "${REFERENCE}":`);
    for (const k of missing) console.error(`   MISSING (in ${code}): ${k}`);
    for (const k of extra) console.error(`   EXTRA   (in ${code}): ${k}`);
  } else {
    console.log(`✓ Locale "${code}" matches "${REFERENCE}" (${localeKeys.size} keys)`);
  }
}

if (hasError) {
  console.error(
    "\ni18n parity check FAILED — sv, en and da must share the exact same key structure.\n",
  );
  process.exit(1);
}

console.log(`\n✓ i18n parity OK — all locales share ${referenceKeys.size} keys.\n`);
