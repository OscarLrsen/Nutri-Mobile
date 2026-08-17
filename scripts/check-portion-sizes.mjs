#!/usr/bin/env node
/**
 * Size guard: personal M/L are only offered as two choices when they are two
 * portions, and the chosen size is what the cart carries.
 *
 * WHY THIS EXISTS. When every scalable ingredient saturates at MaxAmountG for
 * M, the L optimization returns identical grams — same food, same macros,
 * same price — and "L" would be a fake upgrade. And the personalized
 * add-sites used to hardcode sizeId "medium", so a chosen L was stored and
 * cooked as an M.
 *
 * Like pricing:check, this transpiles the REAL features/menu/
 * portionEquivalence.ts with the project's TypeScript and asserts against the
 * imported result, then asserts the wiring so the tested rule is provably the
 * one the screens use.
 *
 * Run: npm run sizes:check
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const failures = [];
const check = (name, actual, expected) => {
  if (actual !== expected) failures.push(`${name}: fick ${actual}, förväntade ${expected}`);
};

// ── Transpile the real module (its only import is type-only → erased) ───
const outDir = mkdtempSync(join(tmpdir(), "nutri-sizes-"));
const js = ts.transpileModule(readFileSync("features/menu/portionEquivalence.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const outPath = join(outDir, "portionEquivalence.mjs");
writeFileSync(outPath, js);

const { areCustomMealPortionsEquivalent, arePersonalSizesEquivalent } =
  await import(pathToFileURL(outPath).href);

const portion = (...ingredients) => ({
  ingredients: ingredients.map(([ingredientId, amountG]) => ({ ingredientId, amountG })),
});
const ready = (p) => ({ status: "ready", data: p });

// ── 1. Different grams → two real portions, both offered ────────────────
check(
  "olika gram → INTE ekvivalenta",
  areCustomMealPortionsEquivalent(portion(["a", 200], ["b", 100]), portion(["a", 240], ["b", 120])),
  false,
);

// ── 2. Identical grams → equivalent ─────────────────────────────────────
check(
  "identiska gram → ekvivalenta",
  areCustomMealPortionsEquivalent(portion(["a", 200], ["b", 100]), portion(["a", 200], ["b", 100])),
  true,
);

// ── 3. Same recipe, different array order → equivalent ──────────────────
check(
  "samma recept i annan ordning → ekvivalenta",
  areCustomMealPortionsEquivalent(portion(["a", 200], ["b", 100]), portion(["b", 100], ["a", 200])),
  true,
);

// ── 4. Same totals, different distribution → NOT equivalent ─────────────
// Both weigh 300 g (and could carry the same floor price) — but they are
// different recipes, so both sizes must stay offered.
check(
  "samma totalvikt men olika fördelning → INTE ekvivalenta",
  areCustomMealPortionsEquivalent(portion(["a", 200], ["b", 100]), portion(["a", 100], ["b", 200])),
  false,
);

// Different ingredient sets, same count.
check(
  "olika ingrediens-id → INTE ekvivalenta",
  areCustomMealPortionsEquivalent(portion(["a", 200]), portion(["c", 200])),
  false,
);

// Subset/superset.
check(
  "delmängd → INTE ekvivalenta",
  areCustomMealPortionsEquivalent(portion(["a", 200], ["b", 100]), portion(["a", 200])),
  false,
);

// ── Screen-level rule: only CONFIRMED equivalence hides anything ────────
const p = portion(["a", 200], ["b", 100]);
check("båda ready + identiska → true", arePersonalSizesEquivalent(ready(p), ready(p)), true);
check("ena laddar → ALDRIG dolt på gissning", arePersonalSizesEquivalent(ready(p), { status: "loading" }), false);
check("off/off (icke-personaliserad) → false", arePersonalSizesEquivalent({ status: "off" }, { status: "off" }), false);
check("error → false", arePersonalSizesEquivalent(ready(p), { status: "error" }), false);

// ── Wiring: the rule and the size actually reach the screens ────────────
const wiring = [
  // Both screens use the ONE shared rule (no duplicated identity logic).
  ["features/menu/MealCard.tsx", "arePersonalSizesEquivalent(personalMedium, personalLarge)", "MealCard använder inte den delade regeln"],
  ["features/menu/MealDetailScreen.tsx", "arePersonalSizesEquivalent(personalMedium, personalLarge)", "MealDetail använder inte den delade regeln"],
  // L filtered only on confirmed equivalence.
  ["features/menu/MealCard.tsx", 'sizesEquivalent && s.id === "large"', "MealCard döljer inte L vid identitet"],
  ["features/menu/MealDetailScreen.tsx", 'sizesEquivalent && s.id === "large"', "MealDetail döljer inte L vid identitet"],
  // Safe fallback L→M when equivalence lands while L is selected.
  ["features/menu/MealCard.tsx", 'sizesEquivalent && selectedSize === "large") setSelectedSize("medium")', "MealCard saknar säker L→M-fallback"],
  ["features/menu/MealDetailScreen.tsx", 'sizesEquivalent && selectedSize === "large") setSelectedSize("medium")', "MealDetail saknar säker L→M-fallback"],
  // Add pauses while the selected personal size loads.
  ["features/menu/MealCard.tsx", "personalAddPending", "MealCard spärrar inte Add under personlig laddning"],
  ["features/menu/MealDetailScreen.tsx", "personalAddPending", "MealDetail spärrar inte Add under personlig laddning"],
  // The chosen size — not a hardcoded "medium" — goes into the cart.
  ["features/menu/MealCard.tsx", "effectiveSize,\n        1,", "MealCard skickar inte vald size till addItem"],
  ["features/menu/MealDetailScreen.tsx", "effectiveSize,\n        quantity,", "MealDetail skickar inte vald size till addItem"],
];
for (const [file, needle, message] of wiring) {
  if (!readFileSync(file, "utf8").replaceAll("\r\n", "\n").includes(needle)) {
    failures.push(`${file}: ${message}`);
  }
}

// The screens without an M/L choice stay semantically medium — documented,
// not accidental.
for (const file of ["features/anpassar/NutriAnpassarScreen.tsx", "features/heldag/HeldagScreen.tsx"]) {
  const src = readFileSync(file, "utf8");
  if (!src.includes('"medium"')) failures.push(`${file}: förlorade sin medium-semantik`);
  if (!src.includes("Semantically correct")) failures.push(`${file}: medium-valet är odokumenterat`);
}

// ── Report ──────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Portion size guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Personal M/L behave as real portions:");
console.log("    identical grams (any order) → equivalent; different grams/distribution → not");
console.log("    equal totals alone never equate portions; loading/error never hides an option");
console.log("    both screens share one rule, hide L on confirmed identity, and fall back L→M safely");
console.log("    the chosen size reaches the cart; Anpassar/Heldag stay documented medium");
