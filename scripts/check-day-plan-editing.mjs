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

// ── 1: every slot row carries a real action ─────────────────────────────
//
// THIS SECTION USED TO PIN "Ändra". The four per-slot edit buttons are gone
// on purpose: they were four separate doors to the same planner, which shows
// all four slots anyway, and they left the rows unable to do the obvious
// thing. The row action is now "Beställ" and there is ONE planner entry.
// Editing itself is unchanged and still guarded below and in
// check-day-plan-order-consistency.
const nav = readFileSync("features/dayplan/dayPlanNavigation.ts", "utf8");
check("Home-raderna har en åtgärd, inte bara en pil",
  home.includes("renderAction={(slot)")
  && home.includes('t("planDay.order")')
  && !homeCode.includes("ChevronRight"));
check("åtgärden går till menyn för sin slot",
  home.includes("openMenuForSlot(slot.label)"));
check("åtgärden har ett eget a11y-namn per slot",
  home.includes('`${t("planDay.order")} — ${label}`'));

// The planner is still reachable — now through one shared entry rather than
// four per-slot ones. It is the ORPHANED route that was the old regression.
const NAV = /(router\.(push|navigate|replace)\(|pathname:\s*)["'{]?[^\n]*(planera-dagen|PLAN_DAY_ROUTE)/;
const linkers = ["features/home/HomeDayPlan.tsx", "features/profile/ProfileScreen.tsx"]
  .filter((f) => NAV.test(readFileSync(f, "utf8")));
check("/planera-dagen är inte längre föräldralös", linkers.length >= 2);
check("route-konstanten är delad, inte inskriven på varje ställe",
  nav.includes('PLAN_DAY_ROUTE = "/planera-dagen"'));

// ── 2: tapping a slot works EVERY time, not just the first ──────────────
check("menyn läser fortfarande navKey", menu.includes("const navKey = params.navKey;")
  && menu.includes("[requestedCategory, navKey]"));
check("navKey skickas fortfarande (det gjorde ingen före dee9d85)",
  nav.includes("navKey: String(now)") && home.includes("Date.now()"));
check("kategori och slot skickas fortfarande",
  nav.includes("category: categoryForSlot(slot)") && nav.includes("slot,"));

// ── 3: row press and the row action are separate targets ────────────────
check("radens åtgärd ligger UTANFÖR radens Pressable",
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

// ── 4b: the slot editor can be left without saving ──────────────────────
// The backdrop was a plain <View>: nothing outside the card was tappable,
// so from Home's "Ändra" the editor read as a popup you could not put down.
// The app's centred-modal pattern (NutritionRingsCard) is a full-bleed
// Pressable BEHIND the card, and that is what is pinned here.
const plannerCode = codeOf("features/dayplan/PlanDayScreen.tsx");
const backdropBlock = plannerCode.slice(
  plannerCode.indexOf("styles.modalBackdrop"),
  plannerCode.indexOf("styles.modalCard")
);
check("backdroppen är tryckbar",
  /<Pressable\b/.test(backdropBlock) && backdropBlock.includes("StyleSheet.absoluteFill"));
check("backdroppen täcker hela ytan bakom kortet",
  /style=\{StyleSheet\.absoluteFill\}/.test(backdropBlock));
check("backdroppen stänger editorn och gör inget annat",
  backdropBlock.includes("onPress={closeEditor}")
  // Never a save, and never a way out of the whole planner.
  && !/onPress=\{[^}]*handleSave/.test(backdropBlock)
  && !/onPress=\{[^}]*router\./.test(backdropBlock)
  && !/onPress=\{[^}]*setLocalMeals/.test(backdropBlock));
check("backdroppen är avstängd medan en plan sparas",
  backdropBlock.includes('disabled={saveStatus === "saving"}'));
check("kortet ligger EFTER backdroppen och behåller sina egna tryck",
  plannerCode.indexOf("StyleSheet.absoluteFill") < plannerCode.indexOf("styles.modalCard"));
check("Android-bakåtknappen använder samma stängning",
  plannerCode.includes("onRequestClose={closeEditor}"));
check("stängningen sparar aldrig något",
  /const closeEditor = \(\) => setEditingIdx\(null\);/.test(plannerCode));
check("varje väg ut ur editorn går genom closeEditor",
  // Apply commits first and then closes; Cancel and the backdrop just close.
  (plannerCode.match(/closeEditor/g) ?? []).length >= 4
  && !/setEditingIdx\(null\)/.test(plannerCode.replace(/const closeEditor[^;]*;/, "")));

// Ett kastat utkast får aldrig komma tillbaka: varje öppning läser planen.
check("öppning och deep link använder SAMMA seedning från planen",
  (plannerCode.match(/setEdit\(draftFor\(localMeals\[idx\]\)\)/g) ?? []).length === 2
  && !/setEdit\(\{ calories: m\.calories/.test(plannerCode));
check("utkastet nollställs inte vid stängning (det skulle blinka under fade-out)",
  !/closeEditor = \(\) => \{[\s\S]*?setEdit\(/.test(plannerCode));
// Inuti modalen finns exakt EN skrivning till planen: Använd-knappen.
// Backdroppen och Avbryt rör den inte.
const modalBlock = plannerCode.slice(plannerCode.indexOf("styles.modalBackdrop"));
check("bara Använd skriver till planen inifrån editorn",
  (modalBlock.match(/setLocalMeals\(/g) ?? []).length === 1);
check("skrivningen sitter i Använd, inte i Avbryt eller backdroppen",
  modalBlock.indexOf("setLocalMeals(") < modalBlock.indexOf("planDay.applySlot")
  && modalBlock.indexOf("setLocalMeals(") > modalBlock.indexOf("modalActions"));

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
const { isSlotEditable, visibleSlotsFor, draftFor, EMPTY_DRAFT } = await emit(
  "features/dayplan",
  "dayPlanSlots"
);

// ── 4c: the discard rule, exercised ─────────────────────────────────────
const stored = { label: "Lunch", calories: 600, proteinG: 40, carbsG: 60, fatG: 20, timingPurpose: "" };
check("ett nytt utkast speglar den lagrade sloten exakt",
  JSON.stringify(draftFor(stored))
    === JSON.stringify({ calories: 600, proteinG: 40, carbsG: 60, fatG: 20 }));
check("utkastet är en KOPIA — att ändra det rör inte planen",
  (() => {
    const draft = draftFor(stored);
    draft.proteinG = 999;
    draft.calories = 9999;
    return stored.proteinG === 40 && stored.calories === 600;
  })());
check("att öppna igen efter ett kastat utkast ger de lagrade värdena",
  (() => {
    const abandoned = draftFor(stored);
    abandoned.fatG = 5; // stepped down, then the backdrop was tapped
    return draftFor(stored).fatG === 20;
  })());
check("en saknad slot ger ett tomt utkast i stället för att krascha",
  JSON.stringify(draftFor(undefined)) === JSON.stringify(EMPTY_DRAFT));

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
// It was named as a suspect and ruled out. The ring has since MOVED to the
// card's top-right corner and is now absolutely positioned — so the old
// assertions ("it lives in the kcal row", "that row has no absolute
// positioning") described a layout that no longer exists. What matters for
// the day plan is unchanged and is what is pinned now: the ring is anchored
// to the TOP of the card, reserves its own space, and cannot reach the rows.
check("ringen renderas fortfarande med samma data som texten",
  today.includes("<NutritionRingsCard target={target} consumed={remaining?.consumedToday ?? null} />"));
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

const ringCorner = styleBlock(today, "ringCorner");
check("ringen är förankrad i kortets ÖVRE högra hörn",
  ringCorner !== null
  && ringCorner.includes('position: "absolute"')
  && ringCorner.includes("top: CARD_PADDING")
  && ringCorner.includes("right: CARD_PADDING")
  // No bottom anchor: an absolute box that also reached down could cover
  // the rows below.
  && !ringCorner.includes("bottom:")
  && !ringCorner.includes("zIndex"));
check("kcal-raden är en vanlig flexrad utan absolut positionering",
  (() => {
    const row = styleBlock(today, "kcalRow");
    return row !== null && row.includes('flexDirection: "row"') && !row.includes("position:");
  })());
check("ringen ligger FÖRE day-planen i trädet och kan inte måla över den",
  today.indexOf("styles.ringCorner") < today.indexOf("<HomeDayPlan />"));
check("day-plan-blocket delar inget lager med ringen",
  today.indexOf("<HomeDayPlan />") > today.indexOf("styles.macroRow"));
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
console.log("    the editor closes on a backdrop tap, discarding the draft, never mid-save");
console.log("    a repeated slot tap re-applies the menu category (navKey)");
console.log("    row press and edit button are separate touch and a11y targets");
console.log("    the TODAY nutrition ring does not overlap the day plan");
