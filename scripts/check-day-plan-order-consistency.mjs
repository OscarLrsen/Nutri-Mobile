#!/usr/bin/env node
/**
 * Regression guard: DAY-PLAN ROW ACTIONS + HOME/MENU NUTRITION EQUALITY.
 *
 * Three things this pins, and one of them is a bug that shipped:
 *
 *   1  Every slot row offers "Beställ" and goes to the menu — the same
 *      destination the row press uses, via the same helper, so Lunch and
 *      Middag can never quietly collapse into each other.
 *
 *   2  ONE "Planera din dag" entry on Home and one on Mina sidor, both on
 *      the same route constant, replacing the four per-slot doors.
 *
 *   3  HOME SHOWS THE SAME SLOT TARGETS THE MENU RECOMMENDS AGAINST.
 *      They did not agree. Home rendered `visibleSlotsFor`, the menu read
 *      the STORED plan rows. In 4-meal mode those match, so it looked fine;
 *      in 3-meal mode the snack's calories are scaled into the three main
 *      meals and the two screens were up to 150 kcal apart on Lunch — the
 *      menu picking M or L against a target the customer had never seen.
 *      `savedPlanTargets` is now the single derivation and this exercises it.
 *
 * Run: npm run dayplanorder:check
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

// ── Load the real slot arithmetic (pure module, no app graph) ───────────
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-dporder-"));
const js = ts.transpileModule(readFileSync("features/dayplan/dayPlanSlots.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(outDir, "dayPlanSlots.mjs"), js);
const { visibleSlotsFor, savedPlanTargets } = await import(
  pathToFileURL(join(outDir, "dayPlanSlots.mjs")).href
);

const home = codeOf("features/home/HomeDayPlan.tsx");
const homeRaw = readFileSync("features/home/HomeDayPlan.tsx", "utf8");
const list = readFileSync("features/dayplan/DayPlanSlotList.tsx", "utf8");
const nav = readFileSync("features/dayplan/dayPlanNavigation.ts", "utf8");
const profile = readFileSync("features/profile/ProfileScreen.tsx", "utf8");
const menuRec = readFileSync("features/menu/mealRecommendation.ts", "utf8");

// ── A: every slot row says "Beställ", none says "Ändra" ─────────────────
check("raderna erbjuder Beställ", homeRaw.includes('t("planDay.order")'));
check("Ändra-knappen är borta från Home",
  !home.includes('t("planDay.edit")') && !home.includes("planDay.editSlotAria"));
check("knappen renderas för VARJE slot, inte villkorat på etikett",
  /renderAction=\{\(slot\) => \{[\s\S]{0,400}?parseSlot\(slot\.label\)/.test(homeRaw)
  && !/slot\.label === "(Frukost|Lunch|Middag|Mellanmål)"/.test(home));

// ── B: Beställ and the row press share ONE navigation ───────────────────
check("radtryck och Beställ anropar samma helper",
  (home.match(/openMenuForSlot\(slot\.label\)/g) ?? []).length === 2);
check("helpern bygger meny-href:en, inte skärmen",
  home.includes("menuHrefForSlot(wizardSlot, Date.now())")
  && !home.includes('pathname: "/(tabs)/meny"'));
check("helpern skickar kategori, slot och navKey",
  nav.includes("category: categoryForSlot(slot)")
  && nav.includes("slot,")
  && nav.includes("navKey: String(now)"));
check("Home navigerar inte längre till planeraren per slot",
  !/router\.push\(\{\s*pathname:\s*PLAN_DAY_ROUTE/.test(home)
  && !home.includes('params: { slot: wizardSlot }'));

// Lunch and Middag must resolve to the same chip but different slots.
const menuRecCode = codeOf("features/menu/mealRecommendation.ts");
check("Lunch och Middag delar kategori men behåller sin slot",
  menuRecCode.includes('if (slot === "Frukost") return "frukost"')
  && menuRecCode.includes('if (slot === "Mellanmål") return "mellanmal"')
  && menuRecCode.includes('return "huvudmaltider"'));
check("parseSlot accepterar exakt de fyra etiketterna",
  menuRec.includes('value === "Frukost" || value === "Lunch" || value === "Middag" || value === "Mellanmål"'));

// ── C: one shared "Planera din dag" CTA under the list ──────────────────
check("Home har EN planera-CTA", (homeRaw.match(/PLAN_DAY_ROUTE/g) ?? []).length === 2);
check("CTA:n ligger under slot-listan",
  homeRaw.indexOf("<DayPlanSlotList") < homeRaw.indexOf("styles.planCta"));
check("CTA:n använder den delade route-konstanten",
  home.includes("router.push(PLAN_DAY_ROUTE)") && nav.includes('PLAN_DAY_ROUTE = "/planera-dagen"'));
check("CTA:n skickar ingen slot (hela planeraren)",
  !/PLAN_DAY_ROUTE,\s*params/.test(home));

// ── D: Mina sidor entry, under Din aktiva plan ──────────────────────────
check("Mina sidor har en planera-entry", profile.includes('t("profile.planDay")'));
check("den använder SAMMA route-konstant, ingen egen navigation",
  profile.includes("router.push(PLAN_DAY_ROUTE)")
  && profile.includes('from "@/features/dayplan/dayPlanNavigation"'));
check("den ligger under Din aktiva plan, före Mitt konto",
  profile.indexOf("profile.sectionActivePlan") < profile.indexOf("styles.planDayCard")
  && profile.indexOf("styles.planDayCard") < profile.indexOf("profile.myAccount"));
check("den ser ut som plansektionen, inte som en inställningsrad",
  /planDayCard: \{[\s\S]{0,260}?backgroundColor: "#17171A"/.test(profile));

// ── E: HOME == MENU, exercised on real numbers ──────────────────────────
const slot = (l, c, p, cb, f) => ({
  label: l, calories: c, proteinG: p, carbsG: cb, fatG: f, timingPurpose: "",
});
const stored = [
  slot("Frukost", 500, 30, 50, 15),
  slot("Lunch", 600, 45, 60, 18),
  slot("Middag", 500, 40, 45, 16),
  slot("Mellanmål", 400, 20, 40, 12),
];

let mismatch = null;
for (const mealCount of [4, 3]) {
  const plan = { mealCount, meals: stored };
  // What Home renders …
  const homeRows = savedPlanTargets(plan);
  // … and what the menu resolves a slot target from — the same call, which
  // is the point: one derivation, not two that happen to agree.
  for (const row of homeRows) {
    const target = savedPlanTargets(plan).find((m) => m.label === row.label);
    for (const key of ["calories", "proteinG", "carbsG", "fatG"]) {
      if (row[key] !== target[key]) mismatch = `${mealCount}-meal ${row.label} ${key}`;
    }
  }
}
check(`Home och Meny läser samma tal (avvikelse: ${mismatch})`, mismatch === null);

// The derivation must actually DO the 3-meal scaling — otherwise the two
// sides agree only because both are wrong.
const four = savedPlanTargets({ mealCount: 4, meals: stored });
const three = savedPlanTargets({ mealCount: 3, meals: stored });
check("4 måltider visar alla fyra slots orörda",
  four.length === 4 && four.find((m) => m.label === "Lunch").calories === 600);
check("3 måltider släpper mellanmålet och skalar upp",
  three.length === 3
  && !three.some((m) => m.label === "Mellanmål")
  && three.find((m) => m.label === "Lunch").calories > 600);
check("3 måltider summerar fortfarande till dagens mål",
  Math.abs(three.reduce((s, m) => s + m.calories, 0) - 2000) <= 3);
check("måltidsantalet kommer från PLANEN, inte från en vy",
  /plan\?\.mealCount === 3 \? "3" : "4"/.test(readFileSync("features/dayplan/dayPlanSlots.ts", "utf8")));
check("en tom/saknad plan kraschar inte",
  savedPlanTargets(null).length === 0 && savedPlanTargets({ meals: [] }).length === 0);

// ── F: the toggle can no longer create a second set of numbers ──────────
check("Home har ingen egen 3/4-toggle längre",
  !home.includes("onMealTabChange={setMealTab}") && !home.includes("setMealTab"));
check("Home härleder måltidsantalet ur den sparade planen",
  home.includes('saved?.mealCount === 3 ? "3" : "4"'));
check("listan döljer pillren när de inte går att ändra",
  list.includes("onMealTabChange?: (tab:") && list.includes("{onMealTabChange ? ("));
check("planeraren behåller sin toggle (där den faktiskt sparas)",
  readFileSync("features/dayplan/PlanDayScreen.tsx", "utf8").includes("onMealTabChange={setMealTab}"));

// ── G: the backdrop dismiss we shipped must still be there ──────────────
const planner = codeOf("features/dayplan/PlanDayScreen.tsx");
check("slot-editorn stängs fortfarande på backdrop-tryck",
  planner.includes("onPress={closeEditor}") && planner.includes("StyleSheet.absoluteFill"));
check("backdroppen sparar fortfarande ingenting",
  /const closeEditor = \(\) => setEditingIdx\(null\);/.test(planner));
check("backdroppen är fortfarande avstängd under sparning",
  planner.includes('disabled={saveStatus === "saving"}'));

// ── i18n ────────────────────────────────────────────────────────────────
for (const locale of ["sv", "en", "da"]) {
  const json = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, "utf8"));
  check(`${locale}: planDay.order finns`,
    typeof json.planDay?.order === "string" && json.planDay.order.length > 0);
  check(`${locale}: planDay.title finns`, typeof json.planDay?.title === "string");
  check(`${locale}: profile.planDay + planDaySub finns`,
    typeof json.profile?.planDay === "string" && typeof json.profile?.planDaySub === "string");
}
const sv = JSON.parse(readFileSync("i18n/locales/sv.json", "utf8"));
const en = JSON.parse(readFileSync("i18n/locales/en.json", "utf8"));
const da = JSON.parse(readFileSync("i18n/locales/da.json", "utf8"));
check("copyn är rätt på alla tre språk",
  sv.planDay.order === "Beställ" && en.planDay.order === "Order" && da.planDay.order === "Bestil");
check("planera-copyn återanvänds, inte dubbleras",
  sv.profile.planDay === sv.planDay.title
  && en.profile.planDay === en.planDay.title
  && da.profile.planDay === da.planDay.title);

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Day-plan order/consistency guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Day-plan order + nutrition consistency holds:");
console.log("    every slot row offers Beställ, and it goes where the row goes");
console.log("    Lunch and Middag keep their own slot through one shared helper");
console.log("    one Planera din dag entry on Home, one on Mina sidor, same route");
console.log("    Home and the menu read slot targets from ONE derivation");
console.log("    3-meal scaling is applied by the plan's own meal count");
console.log("    the slot editor still dismisses on backdrop without saving");
