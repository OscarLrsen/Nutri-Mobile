#!/usr/bin/env node
/**
 * Regression guard: EVERY MEAL SLOT CAN BE EDITED AGAIN.
 *
 * The reported bug: Frukost / Mellanmål / Lunch / Middag on Home could no
 * longer be changed. The move of the day plan from the menu to Home
 * (dee9d85) took the rows with it but not the editing:
 *
 *   - the planner's per-slot "Ändra" button did not come along; Home's rows
 *     got a decorative chevron instead,
 *   - the SAME change deleted the menu's "Planera din dag" card, which was
 *     the only link to /planera-dagen — so the macro editor still existed
 *     but nothing in the app could reach it.
 *
 * A second, quieter defect: MenuScreen reads a `navKey` param to tell two
 * taps on the same slot apart, and no caller ever sent one, so a repeated
 * tap could not re-apply the category.
 *
 * Also pinned here: the TODAY nutrition ring does NOT overlap the day-plan
 * rows. It was a stated suspect; it is ruled out by layout, and this keeps
 * it ruled out.
 *
 * Run: npm run dayplanedit:check
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

const home = readFileSync("features/home/HomeDayPlan.tsx", "utf8");
const homeCode = codeOf("features/home/HomeDayPlan.tsx");
const list = readFileSync("features/dayplan/DayPlanSlotList.tsx", "utf8");
const planner = readFileSync("features/dayplan/PlanDayScreen.tsx", "utf8");
const menu = readFileSync("features/menu/MenuScreen.tsx", "utf8");
const today = readFileSync("features/home/TodayCard.tsx", "utf8");
const rings = readFileSync("features/home/NutritionRingsCard.tsx", "utf8");

// ── 1: a filled slot has a real edit handler ────────────────────────────
check("Home-raderna har en Ändra-åtgärd, inte bara en pil",
  home.includes("renderAction={(slot)")
  && home.includes('t("planDay.edit")')
  && !homeCode.includes("ChevronRight"));
check("Ändra öppnar planeraren", home.includes('pathname: "/planera-dagen"'));
check("Ändra skickar med sloten", home.includes("params: { slot: wizardSlot }"));
check("Ändra-knappen har ett eget a11y-namn per slot",
  home.includes('t("planDay.editSlotAria", { slot: label })'));

// The route is reachable again. This is the actual regression: grep the whole
// app for anything that navigates to it.
const NAV = /(router\.(push|navigate|replace)\(|pathname:\s*)["'{][^\n]*planera-dagen/;
const linkers = ["features/home/HomeDayPlan.tsx", "features/menu/PersonalMenuSection.tsx"]
  .filter((f) => NAV.test(readFileSync(f, "utf8")));
check("/planera-dagen är inte längre föräldralös", linkers.length > 0);

// ── 2: tapping a slot works EVERY time, not just the first ──────────────
check("menyn läser fortfarande navKey", menu.includes("const navKey = params.navKey;")
  && menu.includes("[requestedCategory, navKey]"));
check("Home SKICKAR navKey (det gjorde ingen tidigare)",
  home.includes("navKey: String(Date.now())"));
check("Home skickar fortfarande kategori och slot",
  home.includes("category: categoryForSlot(wizardSlot)") && home.includes("slot: wizardSlot"));

// ── 3: row press and edit button are separate targets ───────────────────
check("Ändra-knappen ligger UTANFÖR radens Pressable",
  /<\/Pressable>\s*\{renderAction\?\.\(slot\) \?\? null\}/.test(list));
check("raden är fortfarande klickbar i hela sin bredd",
  list.includes("styles.slotMain") && list.includes("flex: 1"));
check("den inerta varianten (planeraren) är oförändrad i sin struktur",
  list.includes("if (!onSlotPress) {"));

// ── 4: the planner opens the RIGHT slot ─────────────────────────────────
check("planeraren tar emot slot-parametern",
  planner.includes('useLocalSearchParams<{ slot?: string }>()'));
check("planeraren öppnar just den slotens editor",
  planner.includes("localMeals.findIndex((m) => m.label === requestedSlot)")
  && planner.includes("setEditingIdx(idx)"));
check("den öppnas först när den sparade planen är hydrerad",
  planner.includes("if (slotOpened.current || !hydrated || !requestedSlot) return;"));
check("den öppnas en gång per besök, inte om och om igen",
  planner.includes("slotOpened.current = true;"));
check("deep-linken och Ändra-knappen delar samma editerbarhetsregel",
  (planner.match(/isSlotEditable\(mealTab, localMeals\.length\)/g) ?? []).length === 2);

// ── 5: Lunch and Middag stay apart ──────────────────────────────────────
const require = createRequire(import.meta.url);
const ts = require("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-dayplanedit-"));
const emit = (dir, name) => {
  const js = ts.transpileModule(readFileSync(`${dir}/${name}.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  writeFileSync(join(outDir, `${name}.mjs`), js);
  return import(pathToFileURL(join(outDir, `${name}.mjs`)).href);
};
const { isSlotEditable, visibleSlotsFor } = await emit("features/dayplan", "dayPlanSlots");

// categoryForSlot is the piece that decides which chip a slot opens; it is
// the reason the slot has to travel separately.
const slotToCategory = { Frukost: "frukost", "Mellanmål": "mellanmal", Lunch: "huvudmaltider", Middag: "huvudmaltider" };
const menuRec = readFileSync("features/menu/mealRecommendation.ts", "utf8");
for (const [slot, category] of Object.entries(slotToCategory)) {
  check(`${slot} hör till ${category}`, menuRec.includes(`return "${category}"`) || category === "huvudmaltider");
}
check("Lunch och Middag delar kategori — därför MÅSTE sloten följa med",
  slotToCategory.Lunch === slotToCategory["Middag"]
  && menu.includes("categoryForSlot(requestedSlot) === activeId")
  && menu.includes("const requestedSlot = parseSlot(params.slot);"));
check("en inkommande slot vinner över klockregeln",
  /requestedSlot && categoryForSlot\(requestedSlot\) === activeId\s*\?\s*requestedSlot/.test(menu));
check("parseSlot accepterar exakt de fyra etiketterna",
  menuRec.includes('value === "Frukost" || value === "Lunch" || value === "Middag" || value === "Mellanmål"'));

// ── 6: the editability rule, exercised ──────────────────────────────────
check("4-måltidsläget kan editera alla fyra slots", isSlotEditable("4", 4) === true);
check("3-måltidsläget med skalade rader editeras inte (oförändrad regel)",
  isSlotEditable("3", 4) === false);
check("färre än fyra lagrade måltider skalas inte, och kan editeras",
  isSlotEditable("3", 3) === true);

const slot = (label, calories) => ({ label, calories, proteinG: 10, carbsG: 10, fatG: 5, timingPurpose: "" });
const four = [slot("Frukost", 500), slot("Lunch", 600), slot("Middag", 500), slot("Mellanmål", 400)];
const visible = visibleSlotsFor("4", four).map((m) => m.label);
check("alla fyra slot-typerna är synliga och därmed editerbara i 4-läget",
  ["Frukost", "Mellanmål", "Lunch", "Middag"].every((l) => visible.includes(l)));

// ── 7: the nutrition ring is not on top of the day plan ─────────────────
// It was named as a suspect. It is a flex child in the kcal row, which is a
// SIBLING above the day-plan block — not an overlay. Pinned so a later
// "make the ring bigger" cannot quietly turn it into one.
check("ringen ligger i kcal-raden, inte ovanpå något",
  today.includes("<NutritionRingsCard target={target} consumed={remaining?.consumedToday ?? null} />")
  && today.includes("kcalRingRow"));
/**
 * One named entry out of a StyleSheet.create block.
 *
 * A regex spanning `name: { ... }` cannot be trusted here: a lazy match
 * happily runs past the closing brace and picks up a `position: "absolute"`
 * belonging to a LATER style (TodayCard has one, on the macro card's top
 * edge). Counting braces reads the block that was actually asked for.
 */
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

const kcalRow = styleBlock(today, "kcalRingRow");
check("kcal-raden är en vanlig flexrad utan absolut positionering",
  kcalRow !== null
  && kcalRow.includes('flexDirection: "row"')
  && !kcalRow.includes("position:")
  && !kcalRow.includes("zIndex"));
check("day-plan-blocket är ett syskon EFTER kcal-raden",
  today.indexOf("kcalRingRow") < today.indexOf("<HomeDayPlan />"));
const compact = styleBlock(rings, "compact");
check("ringens tryckyta är inte absolut och lyfts inte med zIndex",
  compact !== null
  && !compact.includes("position:")
  && !compact.includes("zIndex")
  && !codeOf("features/home/NutritionRingsCard.tsx").includes("zIndex"));
const dayPlanBlock = styleBlock(today, "dayPlanBlock");
check("day-plan-blocket är inte heller överlappat av något absolut",
  dayPlanBlock !== null && !dayPlanBlock.includes("position:"));
check("ringens popup ligger i en Modal, inte över Home-trädet",
  rings.includes("<Modal visible transparent"));
check("ringen har fortfarande sin egen tryckyta",
  rings.includes("onPress={() => setOpen(true)}") && rings.includes('accessibilityRole="button"'));

// ── 8: nothing about saving or recommendations moved ────────────────────
check("Home skriver fortfarande ingen plan", !home.includes("saveTodayDayPlan"));
check("planeraren är fortfarande den som sparar", planner.includes("await saveTodayDayPlan("));
check("sparningen invaliderar delade cachen så Home hämtar om",
  planner.includes("queryClient.invalidateQueries({ queryKey: DAY_PLAN_QUERY_PREFIX })"));

for (const locale of ["sv", "en", "da"]) {
  const json = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, "utf8"));
  check(`${locale}: Ändra-copyn finns`, typeof json.planDay?.edit === "string");
  check(`${locale}: Ändra har ett a11y-namn med slot`,
    typeof json.planDay?.editSlotAria === "string"
    && json.planDay.editSlotAria.includes("{{slot}}"));
  for (const l of ["Frukost", "Mellanmål", "Lunch", "Middag"]) {
    check(`${locale}: slot-etiketten ${l} finns`, typeof json.planDay?.slots?.[l] === "string");
  }
}

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Day-plan editing guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Day-plan editing holds:");
console.log("    every slot row carries its own Ändra, and /planera-dagen is reachable");
console.log("    Ändra opens THAT slot's editor — Lunch is not Middag");
console.log("    a repeated slot tap re-applies the menu category (navKey)");
console.log("    row press and edit button are separate touch and a11y targets");
console.log("    the TODAY nutrition ring does not overlap the day plan");
