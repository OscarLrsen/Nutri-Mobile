#!/usr/bin/env node
/**
 * Regression guard: PROFILE / ONBOARDING SCROLLS FORWARD, NEVER BACK.
 *
 * The reported bug: answering a question sometimes threw the sheet UPWARDS,
 * so the customer lost their place. Two independent causes, both pinned here:
 *
 *   1  the target was `PROFILE_STEPS.find(first required gap)` — a search
 *      from the TOP of the list, which happily pointed at a block ABOVE the
 *      one being answered;
 *   2  each block's position came from a remembered `onLayout` y, which is
 *      PARENT-relative — and six of the ten blocks sit inside a grouping
 *      <View>, so their stored y was a small offset inside that group rather
 *      than their real place in the scroll content.
 *
 * The rules are exercised for real (transpiled and imported), not grepped:
 * profileProgression.ts is pure, and so is the chain it imports.
 *
 * Run: npm run profilescroll:check
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

/**
 * Source with comments removed.
 *
 * Every "this must NOT appear" assertion below runs against this rather than
 * the raw file: these modules deliberately document the broken mechanism
 * they replaced, and a guard that cannot tell an explanation of the bug from
 * the bug is worse than no guard.
 */
const codeOf = (path) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── Load the real rules ─────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const ts = require("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-profilescroll-"));

/** Transpile one source file into the temp dir, pointing relative imports
 *  at their .mjs siblings. Only type imports cross the module boundary
 *  beyond these three files, and `import type` is erased. */
const emit = (name) => {
  const src = readFileSync(`features/profile/${name}.ts`, "utf8");
  const js = ts
    .transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    })
    .outputText.replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  writeFileSync(join(outDir, `${name}.mjs`), js);
};
emit("profileOptions");
emit("profileRequirements");
emit("profileProgression");

const { nextAnchorAfter, scrollTargetFor, SCROLL_TOP_PADDING } = await import(
  pathToFileURL(join(outDir, "profileProgression.mjs")).href
);
const { PROFILE_STEPS, missingRequiredSteps } = await import(
  pathToFileURL(join(outDir, "profileRequirements.mjs")).href
);

const EMPTY = {
  gender: null, ageYears: "", weightKg: "", heightCm: "", bodyFatLevel: null,
  activityType: null, stepsRange: null, trainingSessions: null,
  primaryGoal: null, goalPace: null, planFocus: null, menopause: null, cyclePhase: null,
};
const form = (patch) => ({ ...EMPTY, ...patch });
const NUMBERS = { ageYears: "30", weightKg: "80", heightCm: "180" };

// Source order is what "forward" means, so it is asserted rather than assumed.
const ORDER = PROFILE_STEPS.map((s) => s.anchor);
const idxOf = (anchor) => ORDER.indexOf(anchor);

// ── 1: the target is never a block ABOVE the one being answered ─────────
// This is the reported jump, in its two most common shapes.
check("kroppsfett med tomma siffror hoppar INTE upp till grunddata",
  nextAnchorAfter(form({ gender: "Male", bodyFatLevel: 2 }), "bodyFat") !== "basics");
check("mål med tom aktivitet hoppar INTE upp till aktivitet",
  !["basics", "bodyFat", "activityType", "steps", "training"].includes(
    nextAnchorAfter(form({ gender: "Male", primaryGoal: "Maintain" }), "goal")));
check("planfokus med tomt mål hoppar INTE upp till mål",
  !["basics", "activityType", "steps", "training", "goal", "pace"].includes(
    nextAnchorAfter(form({ gender: "Male", planFocus: "Balance" }), "planFocus")));

// The general law, brute-forced over every block and a spread of half-filled
// forms: whatever comes back is strictly later in the form than where we are.
const HALF_FILLED = [
  form({}),
  form({ gender: "Male" }),
  form({ gender: "Female" }),
  form({ gender: "Male", ...NUMBERS }),
  form({ gender: "Female", ...NUMBERS, menopause: "Cycling" }),
  form({ gender: "Male", ...NUMBERS, activityType: "Mixed", primaryGoal: "FatLoss" }),
  form({ gender: "Male", ...NUMBERS, stepsRange: "Under5K", trainingSessions: "None",
         primaryGoal: "MuscleGain", planFocus: "Satiety" }),
  form({ gender: "Female", ...NUMBERS, bodyFatLevel: 2, activityType: "Active",
         stepsRange: "Over12500", trainingSessions: "FiveOrMore", primaryGoal: "Maintain" }),
];
let backwards = null;
for (const f of HALF_FILLED) {
  for (const anchor of new Set(ORDER)) {
    const next = nextAnchorAfter(f, anchor);
    if (next !== null && idxOf(next) <= idxOf(anchor)) backwards = `${anchor} → ${next}`;
  }
}
check(`inget block pekar bakåt (fann: ${backwards})`, backwards === null);

// ── 2: it still moves people FORWARD when there is somewhere to go ──────
check("valt kön med ifyllda siffror går vidare till aktivitet",
  nextAnchorAfter(form({ gender: "Male", ...NUMBERS }), "basics") === "activityType");
check("tomma siffror stannar kvar i grunddata (scrollar inte bort fälten)",
  nextAnchorAfter(form({ gender: "Male" }), "basics") === null);
check("numeriskt Klar går vidare först när ALLA tre talen är giltiga",
  nextAnchorAfter(form({ gender: "Male", ageYears: "30", weightKg: "80" }), "basics") === null
  && nextAnchorAfter(form({ gender: "Male", ...NUMBERS }), "basics") === "activityType");
check("orimliga tal räknas inte som ifyllda",
  nextAnchorAfter(form({ gender: "Male", ageYears: "3", weightKg: "800", heightCm: "12" }), "basics") === null);
check("aktivitet → steg", nextAnchorAfter(form({ activityType: "Mixed" }), "activityType") === "steps");
check("steg → träning", nextAnchorAfter(form({ activityType: "Mixed", stepsRange: "Under5K" }), "steps") === "training");

// ── 3: conditional blocks are targets the moment they appear ────────────
check("ett icke-Maintain-mål pekar på det nyss framtagna tempo-blocket",
  nextAnchorAfter(form({ gender: "Male", ...NUMBERS, activityType: "Mixed",
    stepsRange: "Under5K", trainingSessions: "None", primaryGoal: "FatLoss" }), "goal") === "pace");
check("Maintain har inget tempo och hoppar INTE till toppen",
  nextAnchorAfter(form({ gender: "Male", ...NUMBERS, activityType: "Mixed",
    stepsRange: "Under5K", trainingSessions: "None", primaryGoal: "Maintain" }), "goal") === "planFocus");
check("Cykling pekar på cykelfas",
  nextAnchorAfter(form({ gender: "Female", ...NUMBERS, activityType: "Mixed",
    stepsRange: "Under5K", trainingSessions: "None", primaryGoal: "Maintain",
    planFocus: "Balance", menopause: "Cycling" }), "menopause") === "cyclePhase");
check("Postmenopausal frågar aldrig om cykelfas",
  nextAnchorAfter(form({ gender: "Female", ...NUMBERS, activityType: "Mixed",
    stepsRange: "Under5K", trainingSessions: "None", primaryGoal: "Maintain",
    planFocus: "Balance", menopause: "Postmenopausal" }), "menopause") === null);
check("en man får aldrig cykelfrågor",
  nextAnchorAfter(form({ gender: "Male", ...NUMBERS, activityType: "Mixed",
    stepsRange: "Under5K", trainingSessions: "None", primaryGoal: "Maintain" }), "planFocus") === null);

// ── 4: kroppsfett är valfritt och blir aldrig ett mål ───────────────────
check("den valfria kroppsfettsrutan är aldrig ett scrollmål",
  !new Set(HALF_FILLED.flatMap((f) => [...new Set(ORDER)].map((a) => nextAnchorAfter(f, a))))
    .has("bodyFat"));

// ── 5: scroll-beslutet ─────────────────────────────────────────────────
const geo = (o) => ({
  targetY: 0, targetHeight: 120, currentY: 0, viewportHeight: 600, contentHeight: 3000, ...o,
});
check("ett block långt ned scrollas fram",
  scrollTargetFor(geo({ targetY: 1400 })) === 1400 - SCROLL_TOP_PADDING);
check("resultatet blir aldrig negativt",
  (scrollTargetFor(geo({ targetY: 5, currentY: 0, targetHeight: 2000 })) ?? 0) >= 0);
check("scrollen går aldrig förbi innehållets slut",
  (scrollTargetFor(geo({ targetY: 2950, contentHeight: 3000, viewportHeight: 600 })) ?? 0) <= 2400);
check("ett redan synligt block scrollas inte alls",
  scrollTargetFor(geo({ targetY: 200, targetHeight: 120, currentY: 100, viewportHeight: 600 })) === null);
check("ett block ovanför scrollpositionen ger ALDRIG en bakåtscroll",
  scrollTargetFor(geo({ targetY: 100, currentY: 900 })) === null);
check("ett halvsynligt block längst ned scrollas fram",
  typeof scrollTargetFor(geo({ targetY: 560, targetHeight: 200, currentY: 0, viewportHeight: 600 })) === "number");
check("ett block högre än fönstret kräver bara ett fönster av sig självt",
  scrollTargetFor(geo({ targetY: 50, targetHeight: 2000, currentY: 40, viewportHeight: 600 })) === null);
check("omätt layout ger inget gissat tal",
  scrollTargetFor(geo({ viewportHeight: 0 })) === null);
check("keyboard-hide kan inte dra tillbaka vyn (samma mål, redan synligt)",
  scrollTargetFor(geo({ targetY: 800, currentY: 780, viewportHeight: 600, targetHeight: 120 })) === null);

// ── 6: koden bakom reglerna ────────────────────────────────────────────
const prog = codeOf("features/profile/profileProgression.ts");
check("den gamla top-down-sökningen finns inte kvar i koden",
  !/PROFILE_STEPS\.find\(/.test(prog));
check("sökningen startar EFTER det block som besvarades",
  /findIndex\(\(s\) => s\.anchor === current\)/.test(prog)
  && /for \(let i = startIdx \+ 1;/.test(prog));
check("bakåtspärren är explicit", prog.includes("if (desired <= currentY) return null;"));

const hook = codeOf("features/profile/useProfileProgression.ts");
check("positionen MÄTS mot innehållet, den minns inte ett onLayout-y",
  hook.includes("node.measureLayout(") && !/nativeEvent\.layout\.y\b/.test(hook));
check("layouten hinner sätta sig via ramar, inte via en gissad timeout",
  /requestAnimationFrame\(\s*\(\)\s*=>\s*\{\s*requestAnimationFrame/.test(hook)
  && !/setTimeout/.test(hook));
check("auto-scroll slåss inte med ett finger på listan",
  hook.includes("onScrollBeginDrag") && hook.includes("if (dragging.current) return;"));
check("ankare identifieras med stabila id:n, aldrig index",
  hook.includes("Map<ProfileAnchorId, View>") && !/\[index\]/.test(hook));
check("blur-avancemanget avbryts om ett annat fält tar fokus",
  hook.includes("if (focusedNumeric.current !== null) return;"));

const modal = codeOf("features/profile/EditSectionModal.tsx");
check("varje block är registrerat med sitt stabila id",
  [
    "basics", "bodyFat", "activityType", "steps", "training",
    "goal", "pace", "planFocus", "menopause", "cyclePhase",
  ].every((id) => modal.includes(`progression.registerAnchor("${id}")`)));
check("inga block mäts längre via onLayout",
  !modal.includes("onLayout={registerAnchor"));
check("blocken mäts mot EN wrapper inuti scrollen",
  modal.includes("ref={progression.contentRef}"));
check("wrappern kan inte optimeras bort på Android",
  (modal.match(/collapsable=\{false\}/g) ?? []).length >= 11);
check("iOS gör ingen andra insets-korrigering ovanpå KeyboardAvoidingView",
  modal.includes("automaticallyAdjustKeyboardInsets={false}")
  && modal.includes("automaticallyAdjustContentInsets={false}"));
check("de numeriska fälten rapporterar fokus och Klar",
  modal.includes('progression.onNumericFocus("age")')
  && modal.includes('numericDone("height")'));
check("wrapper-antagandet håller: sheetContent har ingen toppadding",
  /sheetContent: \{ paddingHorizontal: spacing\[5\], paddingBottom: spacing\[5\] \}/.test(modal));

const fields = codeOf("features/profile/editFields.tsx");
check("EditNumField släpper igenom både fokus och blur",
  fields.includes("onFocus={onFocus}") && fields.includes("onBlur={onDone}"));
check("iOS Klar-baren stänger fortfarande tangentbordet",
  fields.includes("onPress={() => Keyboard.dismiss()}"));

const reqs = codeOf("features/profile/profileRequirements.ts");
check("den gamla regeln är borttagen, inte bara oanvänd",
  !reqs.includes("export function nextIncompleteAnchor"));

// Onboarding och profil-editorn är samma sheet — en fix, båda flödena.
const route = readFileSync("features/onboarding/nutritionOnboardingRoute.ts", "utf8");
check("onboarding går genom samma sheet som profil-editorn",
  route.includes('"/(tabs)/konto"'));

// Sanity: reglerna säger fortfarande samma sak som spärren för att spara.
check("en fullt ifylld man saknar ingenting",
  missingRequiredSteps(form({ gender: "Male", ...NUMBERS, activityType: "Mixed",
    stepsRange: "Under5K", trainingSessions: "None", primaryGoal: "Maintain",
    planFocus: "Balance" })).length === 0);
check("en fullt ifylld man har heller inget kvar att scrolla till",
  nextAnchorAfter(form({ gender: "Male", ...NUMBERS, activityType: "Mixed",
    stepsRange: "Under5K", trainingSessions: "None", primaryGoal: "Maintain",
    planFocus: "Balance" }), "basics") === null);

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Profile scroll guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Profile/onboarding scrolling holds:");
console.log("    progression only ever looks FORWARD from the block answered");
console.log("    a gap in the current block keeps the customer where they are");
console.log("    positions are measured against the scroll content, not remembered");
console.log("    an already-visible next question causes no scroll at all");
console.log("    no path produces a backwards scroll, on any half-filled form");
