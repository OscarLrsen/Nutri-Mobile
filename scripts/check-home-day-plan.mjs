#!/usr/bin/env node
/**
 * Regression guard for the four-point batch:
 *
 *   1  the day plan moved from the menu to Home, in the right place, with
 *      the SAME component and working per-slot navigation,
 *   2  (backend — see StampCardTests.Snack_*),
 *   3  breakfast is locked outside its window in the UI, mirroring the
 *      server rule rather than replacing it,
 *   4  the first-order survey waits before covering the order status, with
 *      exactly one timer and real cleanup.
 *
 * Run: npm run dayplan:check
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

// ── 1: Plan your day is off the menu and on Home ────────────────────────
const personal = readFileSync("features/menu/PersonalMenuSection.tsx", "utf8");
// Pinned on code, not on prose: the header comment deliberately records
// what the section used to be and where the card went.
check("menyns Plan your day-entry är borta",
  !/^import .*MenuPlanCard/m.test(personal)
  && !personal.includes("<MenuPlanCard")
  && !/push\(["']\/planera-dagen["']\)/.test(personal)
  && !personal.includes("planHeading"));
check("profilluckans CTA finns kvar (den handlar om menyn, inte om dagen)",
  personal.includes("menu.personal.profileGap")
  && personal.includes("if (!profileGap) return null;"));

const today = readFileSync("features/home/TodayCard.tsx", "utf8");
check("day-planen renderas på Home", today.includes("<HomeDayPlan />"));

// Placement is the requirement, so it is measured rather than assumed:
// after the macros, before ordered/remaining.
const macroIdx = today.indexOf("styles.macroRow");
const planIdx = today.indexOf("<HomeDayPlan />");
const statusIdx = today.indexOf("styles.statusRow");
check("day-planen ligger EFTER protein/kolhydrater/fett",
  macroIdx > 0 && planIdx > macroIdx);
check("day-planen ligger FÖRE beställt idag / kvar av dagens mål",
  statusIdx > 0 && planIdx < statusIdx);

const home = readFileSync("features/home/HomeDayPlan.tsx", "utf8");
check("Home återanvänder den delade komponenten, ingen kopia",
  home.includes("DayPlanSlotList") && home.includes("visibleSlotsFor"));
check("Home lägger inte till egna nätverksanrop",
  home.includes("useTodayNutritionQuery") && home.includes("useTodayDayPlanQuery"));
// Home no longer builds the menu href inline — it moved to
// features/dayplan/dayPlanNavigation.ts so the row press and the row's
// "Beställ" button cannot drift apart. This assertion used to require the
// inline construction, which is precisely what got duplicated.
const dayPlanNav = readFileSync("features/dayplan/dayPlanNavigation.ts", "utf8");
check("Home navigerar till menyn med kategori OCH slot, via den delade helpern",
  home.includes("menuHrefForSlot(wizardSlot, Date.now())")
  && dayPlanNav.includes('pathname: "/(tabs)/meny"')
  && dayPlanNav.includes("category: categoryForSlot(slot)")
  && dayPlanNav.includes("slot,"));
check("Home sparar ingen plan (bara planeraren skriver)",
  !home.includes("saveTodayDayPlan"));

const planner = readFileSync("features/dayplan/PlanDayScreen.tsx", "utf8");
check("planeraren renderar samma komponent",
  planner.includes("<DayPlanSlotList") && planner.includes("visibleSlotsFor"));
check("planeraren har ingen egen dubblett av slot-listan",
  !planner.includes("SLOT_COLOR_FALLBACK") && !planner.includes("const DISPLAY_ORDER"));
check("planerarens Ändra-knapp finns kvar", planner.includes("planDay.editSlotAria"));

const menu = readFileSync("features/menu/MenuScreen.tsx", "utf8");
check("menyn tar emot kategori-parametern", menu.includes("useLocalSearchParams"));
check("bara riktiga kategorier accepteras",
  menu.includes("(CATEGORY_IDS as readonly string[]).includes(requestedCategory)"));
check("inkommande slot vinner över klockregeln men bara i rätt kategori",
  menu.includes("categoryForSlot(requestedSlot) === activeId")
  && menu.includes("slotForCategory(activeId, language)"));

// ── 1b: recommended M/L follows into the detail view ────────────────────
const card = readFileSync("features/menu/MealCard.tsx", "utf8");
check("kortet skickar med sloten till detaljvyn",
  card.includes('pathname: "/meal/[id]"') && card.includes("slot: recommendation.slot"));

const detail = readFileSync("features/menu/MealDetailScreen.tsx", "utf8");
check("detaljvyn räknar fram en rekommendation (defaultade tidigare alltid M)",
  detail.includes("recommendSize(") && detail.includes("slotTarget("));
check("detaljvyn härleder sloten själv när parametern saknas",
  detail.includes("slotParam ?? slotForMeal(meal, language)"));
check("rekommendationen stjäl aldrig ett eget val",
  detail.includes("userTouchedSizeRef") && detail.includes("if (isFixed || !recSizeId || userTouchedSizeRef.current) return;"));
check("M/L-ekvivalensregeln är orörd",
  detail.includes("arePersonalSizesEquivalent")
  && detail.includes('if (sizesEquivalent && selectedSize === "large") setSelectedSize("medium");'));

// ── 3: breakfast window in the UI ───────────────────────────────────────
const bw = readFileSync("features/menu/breakfastWindow.ts", "utf8");
check("mobilens fönster matchar serverns 10–11",
  bw.includes("startHour: 10") && bw.includes("endHour: 11"));
check("frukost identifieras på taggen, inte på kategorin",
  bw.includes('mealTimeTags?.includes(BREAKFAST_TAG)') && !bw.includes('category === "Breakfast"'));
check("modulen säger uttryckligen att servern är enforcement",
  /BreakfastWindowRules\.cs is the enforcement/.test(bw));
check("kortets Add låses utanför fönstret",
  card.includes("breakfastLocked") && card.includes("if (stockLocked || breakfastLocked"));
check("detaljvyns CTA låses utanför fönstret",
  detail.includes("breakfastLocked")
  && detail.includes("if (!meal || stockLocked || breakfastLocked"));
check("frukost går fortfarande att BLÄDDRA i utanför tiden",
  menu.includes("menu.breakfastClosed") && !menu.includes("frukost: []"));

for (const locale of ["sv", "en", "da"]) {
  const json = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, "utf8"));
  check(`${locale}: stängd-frukost-copy finns`,
    typeof json.menu?.breakfastClosed === "string"
    && json.menu.breakfastClosed.includes("{{window}}"));
  check(`${locale}: day-plan-raden har en a11y-hint`,
    typeof json.home?.dayPlanSlotHint === "string");
}

// ── 4: the survey landing delay ─────────────────────────────────────────
const survey = readFileSync("features/survey/OnboardingSurveyOverlay.tsx", "utf8");
check("fördröjningen är 2,5 s", survey.includes("SURVEY_DELAY_MS = 2500"));
check("klockan startar först när skärmen har fokus",
  survey.includes("useFocusEffect") && survey.includes("if (!eligible || !focused)"));
check("exakt en timer, rensad av samma effekt",
  (survey.match(/setTimeout\(/g) ?? []).length === 1
  && survey.includes("return () => clearTimeout(timer);"));
check("timern startas om vid orderbyte", survey.includes("}, [eligible, focused, orderId]);"));
check("inget visas före tiden gått ut", survey.includes("if (!eligible || !armed) return null;"));
check("serverns shouldShow gäller fortfarande",
  survey.includes("surveyQuery.data?.shouldShow === true"));
check("submit/skip-reglerna är orörda",
  survey.includes("submitOnboardingSurvey") && survey.includes("skipOnboardingSurvey"));

const orderStatus = readFileSync("features/order/OrderStatusScreen.tsx", "utf8");
check("ordern kopplas till fördröjningen",
  orderStatus.includes("<OnboardingSurveyOverlay orderId={order.id} />"));
check("food feedback-prompten är orörd av detta",
  !readFileSync("features/feedback/FoodFeedbackPrompt.tsx", "utf8").includes("SURVEY_DELAY_MS"));

// ── 1c: the slot arithmetic runs for real ───────────────────────────────
// dayPlanSlots is pure (its only import is a type), so it is exercised
// rather than grepped.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-dayplan-"));
const js = ts.transpileModule(readFileSync("features/dayplan/dayPlanSlots.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = join(outDir, "dayPlanSlots.mjs");
writeFileSync(mod, js);
const { visibleSlotsFor, orderForDisplay, slotColor } = await import(pathToFileURL(mod).href);

const slot = (label, calories, proteinG = 10, carbsG = 10, fatG = 5) => ({
  label, calories, proteinG, carbsG, fatG, timingPurpose: "",
});
// Backend order: main meals first, snack appended last.
const fourMeals = [
  slot("Frukost", 500), slot("Lunch", 600), slot("Middag", 500), slot("Mellanmål", 400),
];

check("4 måltider visar alla fyra", visibleSlotsFor("4", fourMeals).length === 4);
check("4 måltider visas i dagsordning",
  visibleSlotsFor("4", fourMeals).map((m) => m.label).join(",")
    === "Frukost,Mellanmål,Lunch,Middag");
check("3 måltider släpper mellanmålet",
  visibleSlotsFor("3", fourMeals).map((m) => m.label).join(",") === "Frukost,Lunch,Middag");
check("3 måltider skalar upp så dagen fortfarande summerar",
  Math.abs(visibleSlotsFor("3", fourMeals).reduce((s, m) => s + m.calories, 0) - 2000) <= 3);
check("en tom dag kraschar inte", visibleSlotsFor("3", []).length === 0);
check("noll kalorier ger ingen division med noll",
  visibleSlotsFor("3", [slot("Frukost", 0), slot("Lunch", 0), slot("Middag", 0), slot("Mellanmål", 0)])
    .length === 3);
check("färre än fyra slots lämnas orörda",
  visibleSlotsFor("3", [slot("Lunch", 600), slot("Middag", 500)]).length === 2);
check("okända etiketter hamnar sist, inte först",
  orderForDisplay([slot("Nattmat", 100), slot("Frukost", 500)])[0].label === "Frukost");
check("varje slot har en egen färg",
  new Set(["Frukost", "Lunch", "Middag", "Mellanmål"].map((l, i) => slotColor(l, i))).size === 4);

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Home day-plan guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Four-point fixes hold:");
console.log("    the day plan lives on Home, between the macros and the tally");
console.log("    each slot opens its own menu category, carrying its slot");
console.log("    the detail view recommends the same size the card does");
console.log("    breakfast is browsable but not orderable outside 10–11");
console.log("    the first-order survey waits 2.5s, with one timer and cleanup");
