#!/usr/bin/env node
/**
 * Limit guard: the portion optimizer respects admin-set ingredient limits.
 *
 * WHY THIS EXISTS. Personal portions are bounded by Ingredient
 * MinAmountG/MaxAmountG from the library; where those are NULL the optimizer
 * falls back to 0/500 g. Realistic limits are DB data (admin-owned), so the
 * code contract this guard pins is small but load-bearing:
 *
 *   1. an explicit MaxAmountG is never exceeded,
 *   2. an explicit MinAmountG is never undercut,
 *   3. NULL keeps the historical 0/500 fallback exactly,
 *   4. two sizes that both saturate at max produce IDENTICAL portions —
 *      which the M/L-equivalence rule then collapses into one choice,
 *   5. fixed-role categories (Grönsaker/Såser/Toppings/Mejeri) never scale.
 *
 * Like the other guards, this transpiles the REAL optimizer and equivalence
 * sources and asserts on the imported result.
 *
 * Run: npm run limits:check
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

const outDir = mkdtempSync(join(tmpdir(), "nutri-limits-"));
const transpile = (src, name) => {
  const js = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const p = join(outDir, name);
  writeFileSync(p, js);
  return p;
};
const { optimizeIngredients } = await import(pathToFileURL(
  transpile("features/anpassar/optimizer.ts", "optimizer.mjs")).href);
const { areCustomMealPortionsEquivalent } = await import(pathToFileURL(
  transpile("features/menu/portionEquivalence.ts", "portionEquivalence.mjs")).href);

// ── Fixtures: a protein + a carb base + a fixed sauce ───────────────────
const lib = (minMax) => [
  { id: "prot", name: "Kyckling", category: "Protein",
    proteinG100g: 31, carbsG100g: 0, fatG100g: 3.6, calories100g: 165,
    minAmountG: minMax?.prot?.[0] ?? null, maxAmountG: minMax?.prot?.[1] ?? null },
  { id: "carb", name: "Puré", category: "Baser",
    proteinG100g: 1.5, carbsG100g: 22, fatG100g: 1.5, calories100g: 105,
    minAmountG: minMax?.carb?.[0] ?? null, maxAmountG: minMax?.carb?.[1] ?? null },
  { id: "sauce", name: "Chimichurri", category: "Såser",
    proteinG100g: 1, carbsG100g: 4, fatG100g: 18, calories100g: 180,
    minAmountG: null, maxAmountG: null },
];
const recipe = [
  { ingredientId: "prot", name: "Kyckling", amountG: 155 },
  { ingredientId: "carb", name: "Puré", amountG: 200 },
  { ingredientId: "sauce", name: "Chimichurri", amountG: 30 },
];
const bigTarget = { label: "Lunch", calories: 1400, proteinG: 60, carbsG: 200, fatG: 30, timingPurpose: "" };
const amounts = (res) => Object.fromEntries(res.map((i) => [i.ingredientId, i.amountG]));

// ── 1–2. Explicit limits clamp ──────────────────────────────────────────
const limited = amounts(optimizeIngredients(recipe, lib({ prot: [80, 250], carb: [100, 350] }), bigTarget));
check(`MaxAmountG respekteras (kyckling ${limited.prot} ≤ 250)`, limited.prot <= 250);
check(`MaxAmountG respekteras (puré ${limited.carb} ≤ 350)`, limited.carb <= 350);

const tinyTarget = { label: "Mellanmål", calories: 120, proteinG: 5, carbsG: 10, fatG: 3, timingPurpose: "" };
const minned = amounts(optimizeIngredients(recipe, lib({ prot: [80, 250], carb: [100, 350] }), tinyTarget));
check(`MinAmountG respekteras (kyckling ${minned.prot} ≥ 80)`, minned.prot >= 80);
check(`MinAmountG respekteras (puré ${minned.carb} ≥ 100)`, minned.carb >= 100);

// ── 3. NULL = the historical 0/500 fallback, unchanged ──────────────────
// Needs a target that genuinely asks for more than 250 g of protein source.
// Under the residual model the protein role only covers what the rest of the
// meal leaves behind, so bigTarget's 60 P is met at ~168 g — that is the fit
// working, not the cap moving. 90 P is what actually probes the ceiling.
const proteinHeavyTarget = { ...bigTarget, calories: 1800, proteinG: 90 };
const fallback = amounts(optimizeIngredients(recipe, lib(null), proteinHeavyTarget));
check(`NULL-fallback tillåter > 250 (kyckling ${fallback.prot})`, fallback.prot > 250);
check(`NULL-fallback stannar vid 500 (puré ${fallback.carb} ≤ 500)`, fallback.carb <= 500);

// ── 4. Saturated M and L are identical → equivalence collapses them ─────
// Same limits as before; the target pair is raised so BOTH sizes really do
// saturate. At bigTarget the residual fit now lands M below the protein cap,
// so that pair no longer tests saturation at all.
const sat = { prot: [80, 200], carb: [100, 250] };
const satM = optimizeIngredients(recipe, lib(sat),
  { ...bigTarget, calories: 2000, proteinG: 100, carbsG: 300, fatG: 40 });
const satL = optimizeIngredients(recipe, lib(sat),
  { ...bigTarget, calories: 2400, proteinG: 120, carbsG: 360, fatG: 48 });
check("mättade M/L blir ekvivalenta → L döljs",
  areCustomMealPortionsEquivalent({ ingredients: satM }, { ingredients: satL }));

// ── 5. Fixed-role categories never scale ────────────────────────────────
check(`fixed-roll skalas aldrig (chimichurri ${fallback.sauce} = 30)`, fallback.sauce === 30);
check(`fixed-roll skalas aldrig med limits (${limited.sauce} = 30)`, limited.sauce === 30);

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Ingredient limit guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ The optimizer honours ingredient limits:");
console.log("    explicit max/min clamp; NULL keeps the historical 0/500 fallback");
console.log("    saturated M/L collapse to one choice via the equivalence rule");
console.log("    fixed-role categories (sauces etc.) never scale");
