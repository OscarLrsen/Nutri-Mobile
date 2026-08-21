#!/usr/bin/env node
/**
 * Regression guard: NUTRITION RING POPUP READS, AND THE COMPACT RING SITS
 * IN THE CARD'S CORNER.
 *
 * Two reported problems, one file each:
 *
 *   1  the popup's labels were truncated — "Cal…", "Kol…", "Pr…". The popup
 *      put the ring BESIDE the legend on any window ≥ 380pt, i.e. every
 *      modern iPhone, which left the legend ~130pt. Minus the dot and two
 *      gaps that is 97pt for a label AND its value; the value is mono text
 *      with no flexShrink, so it took its ~88pt and the label — the only
 *      flexible thing in the row — collapsed into an ellipsis.
 *
 *   2  the compact ring sat next to the calorie number instead of in the
 *      top-right corner of the TODAY card.
 *
 * The layout arithmetic is exercised for real across every phone width:
 * nutritionRings.ts is pure (its only import is a type).
 *
 * Run: npm run nutritionui:check
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };
const codeOf = (path) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** One named entry out of a StyleSheet.create block, by counting braces —
 *  a regex spanning `name: { … }` runs past the closing brace and picks up
 *  a later style's properties. */
const styleBlock = (src, name) => {
  const start = src.indexOf(`${name}: {`);
  if (start < 0) return null;
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
};

// ── Load the real layout maths ──────────────────────────────────────────
const require = createRequire(import.meta.url);
const ts = require("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-ringui-"));
const js = ts.transpileModule(readFileSync("features/home/nutritionRings.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(outDir, "nutritionRings.mjs"), js);
const {
  nutritionPopupLayout,
  buildNutrientRings,
  formatRingValue,
  ringGeometry,
  LEGEND_LABEL_MIN,
  LEGEND_MIN_WIDTH,
} = await import(pathToFileURL(join(outDir, "nutritionRings.mjs")).href);

// ── 1: the legend fits its labels on every phone we support ─────────────
// iPhone SE/8 → iPhone 16 Pro Max, plus a tablet and an absurd narrow case.
const WIDTHS = [320, 360, 375, 390, 393, 402, 414, 428, 430, 440, 768, 1024];
let tooNarrow = null;
for (const w of WIDTHS) {
  const l = nutritionPopupLayout(w);
  if (l.labelWidth < LEGEND_LABEL_MIN) tooNarrow = `${w}pt → ${l.labelWidth}pt`;
}
check(`etiketten får plats på varje skärmbredd (för smal vid: ${tooNarrow})`, tooNarrow === null);

const iphone = nutritionPopupLayout(390);
check("en vanlig iPhone ger etiketten gott om plats",
  iphone.labelWidth >= 180);
check("den gamla sida-vid-sida-bredden var för smal (det var buggen)",
  // What the legend used to get on a 390pt phone, reproduced here so the
  // failing case cannot quietly come back.
  iphone.innerWidth - 168 - 20 < LEGEND_MIN_WIDTH);
check("iPhone SE klipper ingenting", nutritionPopupLayout(320).labelWidth >= LEGEND_LABEL_MIN);
check("popupen växer aldrig bredare än kortets tak",
  nutritionPopupLayout(1024).innerWidth === nutritionPopupLayout(2000).innerWidth);
// A window of 0 is not a real phone, but it IS what useWindowDimensions can
// report for a frame while a Modal is presenting. The ring must still get a
// drawable diameter — a zero or negative size reaches react-native-svg as an
// invalid circle and blanks the whole stack.
check("en omätt skärm ger fortfarande en ritbar ring",
  [0, -1, NaN].every((w) => {
    const size = nutritionPopupLayout(w).circleSize;
    return Number.isFinite(size) && size > 0 && ringGeometry(size, 11, 3.5, 4).radius > 0;
  }));

// The ring stack must still be drawable at the smallest diameter we allow.
const smallest = nutritionPopupLayout(320).circleSize;
check("minsta ringen kan fortfarande rita alla fem ringarna",
  ringGeometry(smallest, 11, 3.5, 4).radius > 0);
check("största ringen är inte större än kortet",
  nutritionPopupLayout(430).circleSize <= nutritionPopupLayout(430).innerWidth);

// ── 2: the popup code itself ────────────────────────────────────────────
const card = readFileSync("features/home/NutritionRingsCard.tsx", "utf8");
const cardCode = codeOf("features/home/NutritionRingsCard.tsx");
check("inga etiketter trunkeras",
  !cardCode.includes("numberOfLines") && !cardCode.includes("ellipsizeMode"));
check("layouten kommer från den räknade regeln, inte en gissad brytpunkt",
  cardCode.includes("nutritionPopupLayout(width)") && !cardCode.includes("width >= 380"));
check("popupen stackar — ringen ovanför, legenden i full bredd",
  !cardCode.includes("bodyRow") && !cardCode.includes("sideBySide"));

const label = styleBlock(card, "legendLabel");
const value = styleBlock(card, "legendValue");
const legend = styleBlock(card, "legend");
check("etiketten får växa och är inte låst till en smal kolumn",
  label !== null && label.includes("flex: 1") && label.includes("minWidth: 0")
  && !label.includes("width:") && !label.includes("maxWidth"));
check("värdet krymper aldrig på etikettens bekostnad",
  value !== null && value.includes("flexShrink: 0"));
check("legenden tar hela kortets bredd",
  legend !== null && legend.includes('alignSelf: "stretch"') && !legend.includes('width: "100%"'));
check("färgprickarna kan inte tryckas ihop",
  (styleBlock(card, "dot") ?? "").includes("flexShrink: 0"));

// Every nutrient really does render a label and a value.
const rings = buildNutrientRings(
  { calories: 1780, proteinG: 181, carbsG: 200, fatG: 60, fiberG: 25 },
  { calories: 900, proteinG: 90, carbsG: 100, fatG: 30, fiberG: 12 }
);
check("alla fem näringsämnen finns i legenden", rings.length === 5);
check("varje rad har ett current/target-värde",
  rings.every((r) => /^\d+g? \/ \d+g?$/.test(formatRingValue(r))));
for (const key of ["calories", "carbs", "protein", "fat", "fiber"]) {
  check(`${key} har en egen etikettgren`, card.includes(`case "${key}":`));
}
check("färger och datalogik är orörda",
  cardCode.includes("buildNutrientRings(target, consumed)")
  && !cardCode.includes("RING_COLORS ="));

for (const locale of ["sv", "en", "da"]) {
  const json = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, "utf8"));
  for (const k of ["macroCalories", "macroCarbs", "macroProtein", "macroFat", "macroFiber"]) {
    check(`${locale}: ${k} finns`, typeof json.home?.[k] === "string" && json.home[k].length > 0);
  }
  // The width budget assumes a label of roughly this length; a much longer
  // translation would need the budget revisited rather than silently clipped.
  const longest = ["macroCalories", "macroCarbs", "macroProtein", "macroFat", "macroFiber"]
    .map((k) => json.home[k]).sort((a, b) => b.length - a.length)[0];
  check(`${locale}: längsta etiketten (${longest}) ryms i budgeten`, longest.length <= 16);
}

// ── 3: the compact ring, in the card's top-right corner ─────────────────
const today = readFileSync("features/home/TodayCard.tsx", "utf8");
const corner = styleBlock(today, "ringCorner");
const reserve = styleBlock(today, "ringReserve");

check("ringen sitter absolut i övre högra hörnet",
  corner !== null
  && corner.includes('position: "absolute"')
  && corner.includes("top: CARD_PADDING")
  && corner.includes("right: CARD_PADDING"));
check("hörnet sträcker sig inte nedåt över resten av kortet",
  corner !== null && !corner.includes("bottom:") && !corner.includes("left:")
  && !corner.includes("width:") && !corner.includes("height:"));
check("inget zIndex behövs, för inget överlappar",
  corner !== null && !corner.includes("zIndex") && !codeOf("features/home/TodayCard.tsx").includes("zIndex"));
check("raderna bredvid ringen reserverar plats så text aldrig hamnar under",
  reserve !== null && reserve.includes("paddingRight: RING_SIZE + spacing[3]"));
check("både rubrikraden och kcal-raden reserverar den platsen",
  today.includes("[styles.headRow, styles.ringReserve]")
  && today.includes("[styles.kcalRow, styles.ringReserve]"));
check("storleken delas mellan filerna i stället för att skrivas två gånger",
  today.includes("COMPACT_RING_SIZE") && card.includes("export const COMPACT_RING_SIZE = 54;")
  && card.includes("size={COMPACT_RING_SIZE}"));
check("tryckytan är ringen och inget mer",
  today.includes('pointerEvents="box-none"')
  && (styleBlock(card, "compact") ?? "").includes('alignItems: "center"')
  && !(styleBlock(card, "compact") ?? "").includes("padding"));
check("den gamla kcal-rad-wrappern är borta",
  !today.includes("kcalRingRow"));

// Nothing else in TODAY moved: the sections keep their order.
const order = ["styles.headRow", "styles.kcalRow", "styles.macroRow", "<HomeDayPlan />",
  "styles.statusRow", "styles.waterRow"];
let outOfOrder = null;
for (let i = 1; i < order.length; i++) {
  if (today.indexOf(order[i]) < today.indexOf(order[i - 1])) outOfOrder = `${order[i - 1]} → ${order[i]}`;
}
check(`TODAY:s sektioner ligger kvar i sin ordning (fel vid: ${outOfOrder})`, outOfOrder === null);
check("ringen ligger före allt annat i trädet, som ett hörn ska",
  today.indexOf("styles.ringCorner") < today.indexOf("styles.headRow"));

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Nutrition ring UI guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Nutrition ring UI holds:");
console.log("    the popup stacks, so every nutrient label is shown in full");
console.log("    the value never squeezes the label, and nothing ellipsizes");
console.log("    labels fit on every width from iPhone SE to iPad");
console.log("    the compact ring sits in the TODAY card's top-right corner");
console.log("    the rows beside it reserve space, so no text runs underneath");
console.log("    no other TODAY section moved");
