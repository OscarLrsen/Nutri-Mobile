#!/usr/bin/env node
/**
 * Slot-target fidelity: the meal the app builds is the meal Home promised.
 *
 * WHY THIS EXISTS. "Nutri Anpassar drives adjustable ingredients to their max"
 * was reported as an optimizer bug. It was not. Given the slot target the
 * customer was shown, the optimizer already stops at that target and is
 * already max-invariant. The defect was upstream: getMealCaps' MIN floor
 * overwrote a PLANNED slot target with dailyCalories × goal%, and because
 * carbs/fat are then scaled by targetCalories / baseline.calories, the carb
 * target was inflated with it — on a 4917 kcal muscle_gain day a planned
 * 824 kcal / 118 C snack became 1229 kcal / 176 C. The optimizer then did the
 * right thing with the wrong number and pinned the carb base to its admin max.
 *
 * So this guard pins BOTH halves of the contract, against the real modules:
 *
 *   1. a PLANNED slot target passes through unscaled (no goal-based drift),
 *   2. the MAX cap still applies (a planned slot cannot exceed it),
 *   3. the MIN floor still rescues a DERIVED baseline (missing slot),
 *   4. min/max are CONSTRAINTS, not targets: raising an ingredient's max does
 *      not change the portion when the target is already met below it,
 *   5. but a target that genuinely needs more than max still saturates,
 *   6. fixed-role ingredients keep their recipe grams throughout.
 *
 * Fixtures 4–6 use the real production recipe for "Äpple paj CoR med Biscoff"
 * and the real ingredient rows behind the original report.
 *
 * Run: npm run slottarget:check
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

const outDir = mkdtempSync(join(tmpdir(), "nutri-slottarget-"));
const transpile = (src, name, fix = (s) => s) => {
  const js = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const p = join(outDir, name);
  writeFileSync(p, fix(js));
  return p;
};

transpile("features/anpassar/nutriAnpassarRules.ts", "nutriAnpassarRules.mjs");
const { optimizeIngredients } = await import(pathToFileURL(
  transpile("features/anpassar/optimizer.ts", "optimizer.mjs")).href);
const { buildNutriAdaptiveTarget } = await import(pathToFileURL(
  transpile("features/anpassar/buildNutriAdaptiveTarget.ts", "buildNutriAdaptiveTarget.mjs",
    (s) => s.replace('"./nutriAnpassarRules"', '"./nutriAnpassarRules.mjs"'))).href);

// ── The customer's saved day plan, as Home renders it ───────────────────
const PLAN = [
  { label: "Frukost", calories: 989, proteinG: 53, carbsG: 147, fatG: 21, timingPurpose: "" },
  { label: "Lunch", calories: 1145, proteinG: 53, carbsG: 177, fatG: 25, timingPurpose: "" },
  { label: "Middag", calories: 976, proteinG: 52, carbsG: 147, fatG: 20, timingPurpose: "" },
  { label: "Mellanmål", calories: 824, proteinG: 52, carbsG: 118, fatG: 16, timingPurpose: "" },
];
const SNACK = PLAN[3];

/** muscle_gain on a 4917 kcal day: min = 1229 — above the planned 824. */
const DAILY = 4917;
const targetFor = (overrides = {}) =>
  buildNutriAdaptiveTarget({
    selectedSlot: "Mellanmål",
    nowHour: 15,
    goalType: "muscle_gain",
    todayMeals: PLAN,
    remaining: { calories: DAILY, proteinG: 210, carbsG: 589, fatG: 82 },
    consumedToday: { calories: 500, proteinG: 30, carbsG: 60, fatG: 10 },
    dailyCalories: DAILY,
    ...overrides,
  });

// ── 1. A planned slot target survives the caps unscaled ─────────────────
const planned = targetFor();
check(`planerat slot-mål behålls (${planned.calories} kcal = ${SNACK.calories})`,
  planned.calories === SNACK.calories);
check(`planerade kolhydrater skalas inte (${planned.carbsG} g = ${SNACK.carbsG})`,
  planned.carbsG === SNACK.carbsG);
check(`planerat protein skalas inte (${planned.proteinG} g = ${SNACK.proteinG})`,
  planned.proteinG === SNACK.proteinG);
check(`planerat fett skalas inte (${planned.fatG} g = ${SNACK.fatG})`,
  planned.fatG === SNACK.fatG);

// ── 2. The MAX cap still binds a planned slot ───────────────────────────
// HARD_CAP_KCAL is 1500; a planned 2400 kcal slot must not survive it.
const huge = [...PLAN.slice(0, 3), { ...SNACK, calories: 2400, carbsG: 300 }];
const capped = buildNutriAdaptiveTarget({
  selectedSlot: "Mellanmål", nowHour: 15, goalType: "muscle_gain", todayMeals: huge,
  remaining: { calories: DAILY, proteinG: 210, carbsG: 589, fatG: 82 },
  consumedToday: { calories: 500, proteinG: 30, carbsG: 60, fatG: 10 }, dailyCalories: DAILY,
});
check(`MAX-cap gäller fortfarande (${capped.calories} ≤ 1500)`, capped.calories <= 1500);
check(`MAX-cap skalar ned kolhydraterna med (${capped.carbsG} < 300)`, capped.carbsG < 300);

// ── 3. The MIN floor still rescues a DERIVED baseline ───────────────────
// Slot missing from the plan → fallbackBaseline, which the floor may lift.
const derived = buildNutriAdaptiveTarget({
  selectedSlot: "Mellanmål", nowHour: 15, goalType: "muscle_gain",
  todayMeals: PLAN.slice(0, 3),
  remaining: { calories: 900, proteinG: 60, carbsG: 120, fatG: 20 },
  consumedToday: { calories: 500, proteinG: 30, carbsG: 60, fatG: 10 }, dailyCalories: DAILY,
});
check(`MIN-golvet räddar fortfarande ett härlett mål (${derived.calories} ≥ ${Math.round(DAILY * 0.25)})`,
  derived.calories >= Math.round(DAILY * 0.25));

// ── 4–6. Real recipe: max is a constraint, not a destination ────────────
const LIB = (riceMax) => [
  { id: "apple", name: "Äpplen med Kanel", category: "Övriga",
    calories100g: 52, proteinG100g: 0.3, carbsG100g: 12, fatG100g: 0.2,
    minAmountG: 50, maxAmountG: 80 },
  { id: "biscoff", name: "Biscoff", category: "Övriga",
    calories100g: 484, proteinG100g: 4.9, carbsG100g: 72.6, fatG100g: 19,
    minAmountG: 10, maxAmountG: 20 },
  { id: "rice", name: "Rismjöl", category: "Kolhydrater",
    calories100g: 352, proteinG100g: 6.5, carbsG100g: 79, fatG100g: 1,
    minAmountG: 35, maxAmountG: riceMax },
  { id: "whey", name: "Vassleprotein Vanilj", category: "Protein",
    calories100g: 395, proteinG100g: 75, carbsG100g: 8.2, fatG100g: 6.9,
    minAmountG: 20, maxAmountG: 60 },
];
const RECIPE = [
  { ingredientId: "apple", name: "Äpplen med Kanel", amountG: 50 },
  { ingredientId: "biscoff", name: "Biscoff", amountG: 10 },
  { ingredientId: "rice", name: "Rismjöl", amountG: 50 },
  { ingredientId: "whey", name: "Vassleprotein Vanilj", amountG: 30 },
];
const gramsAt = (riceMax, target) =>
  Object.fromEntries(optimizeIngredients(RECIPE, LIB(riceMax), target).map((i) => [i.ingredientId, i.amountG]));

// 4. Raising max must not raise the portion when the target is met below it.
const at150 = gramsAt(150, planned);
const at200 = gramsAt(200, planned);
check(`rice max 150→200 ändrar inte portionen (${at150.rice} vs ${at200.rice})`,
  at150.rice === at200.rice);
check(`rice stannar under 150 när målet nås där (${at150.rice} < 150)`, at150.rice < 150);
check(`whey går inte automatiskt till max (${at150.whey} < 60)`, at150.whey < 60);

// 5. A target that truly needs more than max still saturates.
const hungry = { label: "Mellanmål", calories: 1400, proteinG: 60, carbsG: 260, fatG: 24, timingPurpose: "" };
check(`max fungerar fortfarande som constraint (${gramsAt(150, hungry).rice} = 150)`,
  gramsAt(150, hungry).rice === 150);
check(`höjt max används när målet kräver det (${gramsAt(200, hungry).rice} = 200)`,
  gramsAt(200, hungry).rice === 200);

// 6. Fixed-role ingredients never move.
check(`äpple låst på recept-gram (${at200.apple} = 50)`, at200.apple === 50);
check(`biscoff låst på recept-gram (${at200.biscoff} = 10)`, at200.biscoff === 10);

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Slot target fidelity guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Måltiden som byggs är måltiden Home lovade:");
console.log(`    planerat slot-mål passerar caps oskalat (${planned.calories} kcal / ${planned.carbsG} C)`);
console.log("    MAX-cap gäller fortfarande; MIN-golvet räddar bara härledda mål");
console.log(`    rice max 150 vs 200 ger samma portion (${at150.rice} g) — max är constraint, inte mål`);
console.log("    men ett mål som kräver mer än max mättar fortfarande");
console.log("    fixed-roll (äpple, biscoff) står kvar på recept-gram");
