#!/usr/bin/env node
/**
 * Pricing guard: custom/personalized meals keep the backend's EXACT öre price
 * through the cart.
 *
 * WHY THIS EXISTS. The cart used to rebuild a custom line's price from a
 * whole-kronor surcharge, so the server's 18586 öre displayed and summed as
 * 18600 — the shown total could differ from what the backend charges. The fix
 * routes every cart line through utils/cartMath's getItemUnitPriceOre /
 * getItemLineTotalOre with an exact customPriceOre carried on the line.
 *
 * This script tests THE REAL SOURCE, not a re-implementation: it transpiles
 * utils/pricing.ts and utils/cartMath.ts with the project's own TypeScript
 * compiler (type-only imports erase; the one value import is re-pointed),
 * imports the result, and asserts the numbers. It then asserts the wiring —
 * that CartContext/CartScreen actually use the helpers and that every
 * personalized add-site passes totalPriceOre — so the tested function cannot
 * silently stop being the one in use.
 *
 * Run: npm run pricing:check   (no Expo/Metro, no network)
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

// ── Transpile the real modules ──────────────────────────────────────────
const outDir = mkdtempSync(join(tmpdir(), "nutri-pricing-"));
const transpile = (srcPath, outName, rewrites = {}) => {
  let source = readFileSync(srcPath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  let output = js;
  for (const [from, to] of Object.entries(rewrites)) output = output.replaceAll(from, to);
  const outPath = join(outDir, outName);
  writeFileSync(outPath, output);
  return outPath;
};

transpile("utils/pricing.ts", "pricing.mjs");
const cartMathPath = transpile("utils/cartMath.ts", "cartMath.mjs", {
  '"@/utils/pricing"': '"./pricing.mjs"',
});

const { getItemUnitPriceOre, getItemLineTotalOre } = await import(pathToFileURL(cartMathPath).href);

// ── Fixtures ────────────────────────────────────────────────────────────
const meal = (basePrice) => ({
  id: "m1", name: "Test", description: "", image: "", basePrice, category: "Bowls",
  available: true, macros: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  ingredients: [], sizes: [],
});

const customLine = (priceOre, quantity = 1) => ({
  id: "m1-custom-x", meal: meal(139), sizeId: "medium", quantity,
  isCustom: true, ingredientSurchargeKr: 47, customPriceOre: priceOre,
});

// ── 1–2. Exact öre survives, and multiplies exactly ─────────────────────
check("custom 18586 behålls exakt", getItemUnitPriceOre(customLine(18586)), 18586);
check("custom 18586 blir INTE 18600", getItemUnitPriceOre(customLine(18586)) === 18600, false);
check("quantity 2 → 37172", getItemLineTotalOre(customLine(18586, 2)), 37172);

// ── 3. Two different customs sum exactly in öre ─────────────────────────
const sum = getItemLineTotalOre(customLine(18586)) + getItemLineTotalOre(customLine(12233));
check("18586 + 12233 = 30819", sum, 30819);

// ── 4. Fixed meals: historical whole-SEK behaviour untouched ────────────
const fixedLine = (basePrice, sizeId, quantity = 1) => ({
  id: `m1-${sizeId}`, meal: meal(basePrice), sizeId, quantity, isCustom: false,
});
check("fixed medium 119 kr → 11900", getItemUnitPriceOre(fixedLine(119, "medium")), 11900);
check("fixed large 119×1.2 → round(142.8)=143 kr → 14300", getItemUnitPriceOre(fixedLine(119, "large")), 14300);
check("fixed large ×3 → 42900", getItemLineTotalOre(fixedLine(119, "large", 3)), 42900);

// ── Legacy: persisted customs without customPriceOre price as before ────
const legacyLine = {
  id: "m1-custom-old", meal: meal(119), sizeId: "medium", quantity: 1,
  isCustom: true, ingredientSurchargeKr: 67,
};
check("legacy custom 119+67 kr → 18600 (historiskt oförändrat)", getItemUnitPriceOre(legacyLine), 18600);

// ── Drinks: öre passthrough ─────────────────────────────────────────────
const drinkLine = {
  id: "drink-d1", kind: "drink", quantity: 2, sizeId: "medium", isCustom: false,
  meal: meal(20), drink: { priceOre: 2000 },
};
check("drink 2000 öre × 2 → 4000", getItemLineTotalOre(drinkLine), 4000);

// ── Wiring: the tested function is the one actually in use ──────────────
const wiring = [
  ["context/CartContext.tsx", "getItemLineTotalOre", "CartContext summerar inte via cartMath"],
  ["features/cart/CartScreen.tsx", "getItemUnitPriceOre", "CartScreen prissätter inte raden via cartMath"],
  ["features/menu/MealCard.tsx", "personalData.calc.totalPriceOre,", "MealCard skickar inte exakt öre till addItem"],
  ["features/menu/MealDetailScreen.tsx", "personalData.calc.totalPriceOre,", "MealDetail skickar inte exakt öre till addItem"],
  ["features/anpassar/NutriAnpassarScreen.tsx", "calcResult.totalPriceOre", "Anpassar skickar inte exakt öre till addItem"],
  ["features/heldag/HeldagScreen.tsx", "r.calcResult.totalPriceOre", "Heldag skickar inte exakt öre till addItem"],
];
for (const [file, needle, message] of wiring) {
  if (!readFileSync(file, "utf8").includes(needle)) failures.push(`${file}: ${message}`);
}

// ── Report ──────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Custom meal pricing guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Custom meal pricing preserves exact öre through the cart:");
console.log("    18586 öre stays 18586 (never 18600); ×2 = 37172; sums are exact");
console.log("    fixed meals and drinks keep their historical pricing");
console.log("    legacy persisted customs keep the old surcharge formula");
console.log("    CartContext/CartScreen price through cartMath; all four add-sites pass totalPriceOre");
