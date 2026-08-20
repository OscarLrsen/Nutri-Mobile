#!/usr/bin/env node
/**
 * Regression guard for the three physical-QA bugs.
 *
 *   1  the nutrition rings are filled by what was EATEN, never by the target,
 *   2  the confirmation deep link lands on a real route, not a 404,
 *   3  the profile sheet keeps its size after a trip to Safari.
 *
 * Run: npm run qa3:check
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

// ── 1: the numerator is intake, the denominator is the goal ─────────────
const card = readFileSync("features/home/TodayCard.tsx", "utf8");
check("ringen matas med consumedToday som täljare och target som nämnare",
  card.includes("<NutritionRingsCard target={target} consumed={remaining?.consumedToday ?? null} />"));

const stack = readFileSync("features/home/NutritionRingStack.tsx", "utf8");
check("spåret är NEUTRALT, inte näringsämnets egen färg",
  stack.includes("const TRACK_COLOR") && stack.includes('stroke={TRACK_COLOR}')
  && !/stroke=\{ring\.color\}\s*\n\s*strokeOpacity/.test(stack));
check("bara verklig progress ritas i färg",
  stack.includes("ring.progress > 0 ?"));
check("bågen ritas från progress, inte från target",
  stack.includes("dashOffset(circumference, ring.progress)"));

const queries = readFileSync("services/api/nutritionQueries.ts", "utf8");
check("consumedToday-semantiken är dokumenterad som beställda ordrar",
  queries.includes("Confirmed/Preparing/Ready/Delivered"));
check("ringarna delar nutrition-cachen så refetch uppdaterar dem",
  queries.includes('queryKey: ["nutrition", "remaining-today"'));

// ── 2: the deep link has somewhere to land ──────────────────────────────
check("app/auth/callback.tsx finns", existsSync("app/auth/callback.tsx"));

const layout = readFileSync("app/_layout.tsx", "utf8");
check("routen är registrerad", layout.includes('<Stack.Screen name="auth/callback" />'));

// It must sit OUTSIDE both guards — the link arrives signed out and the
// session lands a moment later — but NOT first. Declared first it became
// the navigator's fallback screen and a sign-out parked the app on it; see
// check-auth-reset, which owns that invariant in full.
const routeIdx = layout.indexOf('<Stack.Screen name="auth/callback" />');
check("routen ligger utanför båda Stack.Protected-grupperna",
  routeIdx > 0 && routeIdx > layout.lastIndexOf("</Stack.Protected>"));

const register = readFileSync("features/auth/RegisterScreen.tsx", "utf8");
const callbackScreen = readFileSync("app/auth/callback.tsx", "utf8");
check("returlänken pekar på exakt den path routen ligger på",
  register.includes('Linking.createURL("auth/callback")'));
check("callback-skärmen gör ingen egen auth (handlern äger den)",
  !callbackScreen.includes("setSession") && !callbackScreen.includes("supabase"));
// CORRECTED. This originally asserted the screen navigates nowhere,
// "because the guard moves the app" — which is false for a route that sits
// OUTSIDE the guards: nothing removes it when the session lands, so the app
// stayed on it. The screen must navigate, and check-auth-reset pins where.
check("callback-skärmen kan lämna sig själv",
  callbackScreen.includes("router.replace"));
check("callback-skärmen gör fortfarande ingen egen auth",
  !callbackScreen.includes("setSession"));

const handler = readFileSync("services/auth/AuthDeepLinkHandler.tsx", "utf8");
check("handlern fångar både kall- och varmstart",
  handler.includes("getInitialURL()") && handler.includes('addEventListener("url"'));
check("handlern sitter kvar ovanför navigatorn",
  layout.includes("<AuthDeepLinkHandler />"));

for (const locale of ["sv", "en", "da"]) {
  const json = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, "utf8"));
  check(`${locale}: callback-skärmen har text`,
    typeof json.auth?.completingSignIn === "string");
}

// ── 3: the sheet survives a trip to Safari ──────────────────────────────
const sheet = readFileSync("components/ui/SwipeDownSheet.tsx", "utf8");
check("höjden räknas om när appen kommer tillbaka till förgrunden",
  sheet.includes("AppState.addEventListener") && sheet.includes('next === "active"'));
check("lyssnaren städas",
  sheet.includes("return () => sub.remove();"));
check("draget nollställs så en återöppnad sheet inte ärver en halv dragning",
  sheet.includes("translateY.value = 0;"));
check("inget hårdkodat 240-golv kvar",
  !sheet.includes("Math.max(height, 240)"));
check("orimliga insets ignoreras i stället för att lydas",
  sheet.includes("MAX_PLAUSIBLE_INSET_RATIO"));
check("golvet är en andel av fönstret, inte ett absolut tal",
  sheet.includes("MIN_SHEET_RATIO") && sheet.includes("windowHeight * MIN_SHEET_RATIO"));
check("en otillförlitlig mätning kapar ingenting alls",
  sheet.includes("heightCap !== null ? { maxHeight: heightCap } : null"));
check("safe-area-fixen finns kvar",
  sheet.includes("useSafeAreaInsets") && sheet.includes("clearance * 2"));
check("swipe-tröskeln är orörd",
  sheet.includes("DISMISS_DISTANCE = 120") && sheet.includes("DISMISS_VELOCITY = 900"));
check("in-flight-frysningen är orörd", sheet.includes(".enabled(enabled)"));
check("ingen scale-transform lämnas kvar", !sheet.includes("scale"));

// ── Behavioural ─────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const ts = require("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-qa3-"));
const emit = (src, name, rewrite = (s) => s) => {
  const js = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const out = join(outDir, name);
  writeFileSync(out, rewrite(js));
  return out;
};

// -- rings: intake drives the arc --
const { buildNutrientRings, formatRingValue } = await import(
  pathToFileURL(emit("features/home/nutritionRings.ts", "rings.mjs")).href
);

const target = { calories: 1780, proteinG: 142, carbsG: 181, fatG: 54, fiberG: 25 };
const nothing = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

const empty = buildNutrientRings(target, nothing);
check("inget ätit → varje ring är tom, trots att målen finns",
  empty.every((r) => r.progress === 0));
check("målen syns ändå som nämnare",
  empty[0].target === 1780 && empty[2].target === 142);

// Pontus's own example.
const partial = buildNutrientRings(target, { ...nothing, proteinG: 40 });
const proteinRing = partial.find((r) => r.key === "protein");
check("40g av 142g protein ger ca 28 % fylld ring",
  Math.abs(proteinRing.progress - 40 / 142) < 1e-9
  && Math.round(proteinRing.progress * 100) === 28);
check("texten visar ätit / mål", formatRingValue(proteinRing) === "40g / 142g");
check("övriga ringar påverkas inte av proteinet",
  partial.filter((r) => r.key !== "protein").every((r) => r.progress === 0));

const half = buildNutrientRings({ ...nothing, calories: 100 }, { ...nothing, calories: 50 });
check("50 av 100 ger halv ring", half[0].progress === 0.5);

const over = buildNutrientRings({ ...nothing, calories: 100 }, { ...nothing, calories: 120 });
check("120 av 100 fyller ringen helt men texten säger 120 / 100",
  over[0].progress === 1 && formatRingValue(over[0]) === "120 / 100");

// The failure mode being fixed: the target must never be the numerator.
check("målet kan aldrig fylla ringen på egen hand",
  buildNutrientRings(target, null).every((r) => r.progress === 0));
check("saknad intake-data ger tomma ringar, inte fulla",
  buildNutrientRings(target, undefined).every((r) => r.progress === 0));

// -- sheet: no measurement can produce a mini-card --
const { maxSheetHeight, SAFE_TOP_GAP } = await import(
  pathToFileURL(
    emit("components/ui/SwipeDownSheet.tsx", "sheet.mjs", (js) =>
      js.replace(/^import[\s\S]*?;$/gm, "").replace(/export function SwipeDownSheet[\s\S]*$/m, "")
    )
  ).href
);

const H = 852;
for (const [label, inset] of [["Dynamic Island", 59], ["notch", 47], ["ingen notch", 20]]) {
  const bottom = maxSheetHeight(H, inset, "bottom");
  check(`${label}: bottensheetens topp ligger under insetet`,
    bottom !== null && H - bottom >= inset + SAFE_TOP_GAP);
  const centered = maxSheetHeight(H, inset, "center");
  check(`${label}: centrerad sheet håller marginal uppåt`,
    centered !== null && (H - centered) / 2 >= inset + SAFE_TOP_GAP);
  check(`${label}: sheeten är fortfarande stor`, centered >= H * 0.6);
}

// The exact regression: bad readings after returning from Safari.
check("nollhöjd kapar ingenting (anroparens egen style gäller)",
  maxSheetHeight(0, 59, "center") === null);
check("NaN-höjd kapar ingenting", maxSheetHeight(NaN, 59, "center") === null);
check("negativ höjd kapar ingenting", maxSheetHeight(-100, 59, "center") === null);
check("absurt inset ger INTE en mini-ruta",
  maxSheetHeight(H, 400, "center") >= H * 0.6);
check("inset lika stort som skärmen ger INTE en mini-ruta",
  maxSheetHeight(H, H, "center") >= H * 0.6);
check("negativt inset behandlas som noll",
  maxSheetHeight(H, -50, "center") === maxSheetHeight(H, 0, "center"));
check("NaN-inset behandlas som noll",
  maxSheetHeight(H, NaN, "center") === maxSheetHeight(H, 0, "center"));
check("en liten skärm ger fortfarande en användbar sheet",
  maxSheetHeight(400, 59, "center") >= 400 * 0.6);

// Before/after a foreground round trip the answer must be identical for the
// same inputs — the cap is a pure function of them, nothing is cached.
check("samma indata ger alltid samma höjd (inget cachas)",
  maxSheetHeight(H, 59, "center") === maxSheetHeight(H, 59, "center")
  && maxSheetHeight(H, 59, "bottom") === maxSheetHeight(H, 59, "bottom"));

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Three-QA-bug guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Three physical QA bugs hold:");
console.log("    the rings fill from what was eaten, never from the target");
console.log("    the confirmation deep link lands on a real route, not 404");
console.log("    no bad measurement can shrink the profile sheet to a chip");
