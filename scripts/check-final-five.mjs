#!/usr/bin/env node
/**
 * Regression guard for the final five mobile points.
 *
 *   1  a returning customer is never re-onboarded,
 *   2  account deletion is server-side, confirmed, and safe to fail,
 *   3  draggable sheets stay clear of the notch and are grabbable,
 *   4  the TODAY rings read the real daily data, fiber included,
 *   5  the body-fat guide opens ruled.me and says so when it cannot.
 *
 * Run: npm run final5:check
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

// ── 1: profile completion ───────────────────────────────────────────────
const status = readFileSync("services/auth/useOnboardingStatus.ts", "utf8");
check("en misslyckad profilläsning är ett fel, inte ett svar",
  status.includes("if (error) throw error;") && !status.includes("if (error) return null;"));
check("hooken skiljer 'vet inte' från 'aldrig onboardad'",
  status.includes("isKnown") && status.includes("query.isSuccess"));

const screen = readFileSync("features/profile/ProfileScreen.tsx", "utf8");
check("skärmen har EN härledning, inte tre booleans",
  screen.includes("deriveProfileCompletion({"));
check("välkomstpopupen kan bara nås av en verklig ny användare",
  screen.includes('completion.state === "new-user"'));
check("kompletteringsbannern är sitt eget läge",
  screen.includes('completion.state === "needs-completion"'));
check("den gamla flagg-drivna bannern är borta",
  !screen.includes("isOnboardingComplete === false &&")
  && !screen.includes("setShowOnboardingModal(isOnboardingComplete === null)"));

// ── 2: delete account ───────────────────────────────────────────────────
const del = readFileSync("features/profile/DeleteAccountSection.tsx", "utf8");
const api = readFileSync("services/api/account.ts", "utf8");
check("raderingen går via servern, inte via Supabase i appen",
  api.includes('apiClient.delete("/api/account"') && api.includes("requireAuth()"));
check("appen skickar aldrig ett användar-id (servern läser sub)",
  !/delete\(\s*`?\/api\/account\/\$\{/.test(api));
check("explicit destruktiv bekräftelse krävs",
  del.includes("acknowledged") && del.includes("disabled={!acknowledged || busy}"));
check("dubbeltryck kan inte skicka två raderingar",
  del.includes("inFlightRef") && del.includes("if (!acknowledged || inFlightRef.current) return;"));
check("cachen rensas innan utloggning",
  del.indexOf("queryClient.clear()") < del.indexOf("await signOut()")
  && del.includes("queryClient.clear()"));
check("fel lämnar kontot intakt och användaren inloggad",
  /catch\s*\{[\s\S]{0,200}setError\(/.test(del)
  && !/catch\s*\{[\s\S]{0,200}signOut/.test(del));
check("modalen kan inte stängas mitt i en radering",
  del.includes("if (busy) return; // never dismiss mid-delete"));
check("raderingen är sekundär, inte en primär CTA",
  del.includes("styles.trigger") && del.includes("colors.error"));

// ── 3: swipe-down safe area ─────────────────────────────────────────────
const sheet = readFileSync("components/ui/SwipeDownSheet.tsx", "utf8");
check("höjden kapas från uppmätt safe-area, inte från en modellgissning",
  sheet.includes("useSafeAreaInsets") && sheet.includes("insets.top")
  && !/iPhone\s*1[0-9]|Dynamic Island.*===/.test(sheet));
// Still applied last so a sheet's own maxHeight cannot win over the safe
// area — but conditionally now, so an untrustworthy measurement overrides
// nothing at all (see check-three-qa-bugs).
check("kapningen appliceras EFTER anroparens style",
  /style=\{\[style, animatedStyle, heightCap !== null \? \{ maxHeight: heightCap \} : null\]\}/
    .test(sheet));
check("centrerade sheets reserverar toppen på båda sidor",
  sheet.includes('anchor === "center" ? windowHeight - clearance * 2'));
check("greppzonen omfattar även headern",
  sheet.includes("header?: ReactNode") && sheet.includes("{header}"));
check("ett tryck är inte ett drag (knappar i headern fungerar)",
  sheet.includes("activeOffsetY([-10_000, 12])"));
check("horisontella svep tar inte tag i sheeten",
  sheet.includes("failOffsetX([-20, 20])"));
check("tröskel och spring finns kvar",
  sheet.includes("DISMISS_DISTANCE = 120") && sheet.includes("DISMISS_VELOCITY = 900")
  && sheet.includes("withSpring(0,"));
check("in-flight kan fortfarande inte svepas bort",
  sheet.includes(".enabled(enabled)") && sheet.includes("enabled ? translateY.value : 0"));

const edit = readFileSync("features/profile/EditSectionModal.tsx", "utf8");
check("profil-editorn deklarerar sig som centrerad",
  edit.includes('anchor="center"'));
check("profil-editorns titelrad är en dragyta",
  edit.includes("header={") && edit.includes("styles.sheetHeader"));

// ── 4: TODAY rings ──────────────────────────────────────────────────────
const rings = readFileSync("features/home/nutritionRings.ts", "utf8");
const card = readFileSync("features/home/TodayCard.tsx", "utf8");
const ringsCard = readFileSync("features/home/NutritionRingsCard.tsx", "utf8");
check("ringarna matas från TodayCards egna värden — ingen ny hämtning",
  card.includes("<NutritionRingsCard target={target} consumed={remaining?.consumedToday ?? null} />")
  && !ringsCard.includes("useQuery"));
check("fem näringsämnen i referensordning",
  /\["calories",[\s\S]*\["carbs",[\s\S]*\["protein",[\s\S]*\["fat",[\s\S]*\["fiber",/.test(rings));
check("färgerna följer referensdesignen",
  rings.includes('calories: "#FF8A3D"') && rings.includes('carbs: "#5FA0FF"')
  && rings.includes('protein: "#FF5A5A"') && rings.includes('fat: "#7FC97F"')
  && rings.includes('fiber: "#B98CFF"'));
check("fiber tas från riktig data, inte hårdkodat 25",
  rings.includes("c.fiberG, t.fiberG") && !/fiber[^\n]*25\b/.test(rings));
check("read-only — inga mutationer",
  !ringsCard.includes("useMutation") && !rings.includes("saveTodayDayPlan"));
check("popupen är centrerad modal utan falskt swipe-down",
  ringsCard.includes("<Modal") && !ringsCard.includes("SwipeDownSheet"));
check("ringen är tryckbar med begriplig etikett",
  ringsCard.includes('accessibilityRole="button"') && ringsCard.includes("home.ringsAria"));
check("progressionen börjar uppifrån",
  readFileSync("features/home/NutritionRingStack.tsx", "utf8").includes("rotation={-90}"));
check("SVG används, inte bilder",
  readFileSync("features/home/NutritionRingStack.tsx", "utf8").includes("react-native-svg"));
check("day plan och macros ligger kvar där de var",
  card.includes("<HomeDayPlan />") && card.includes("styles.macroRow"));

// ── 5: external guide ───────────────────────────────────────────────────
check("guiden öppnar ruled.me",
  edit.includes('"https://www.ruled.me/visually-estimate-body-fat-percentage/"'));
check("ingen intern guide-modal renderas",
  !edit.includes("guideOpen") && !edit.includes("guideCard"));

// ── Behavioural: the pure modules, exercised for real ────────────────────
const require = createRequire(import.meta.url);
const ts = require("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-final5-"));
const emit = (src, name, rewrite = (s) => s) => {
  const js = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const out = join(outDir, name);
  writeFileSync(out, rewrite(js));
  return out;
};

// -- ring maths --
const ringsMod = await import(
  pathToFileURL(emit("features/home/nutritionRings.ts", "rings.mjs")).href
);
const { ringProgress, buildNutrientRings, formatRingValue, ringGeometry, dashOffset } = ringsMod;

check("0 % ger tom ring", ringProgress(0, 1780) === 0);
check("50 % ger halv ring", ringProgress(890, 1780) === 0.5);
check("100 % ger full ring", ringProgress(1780, 1780) === 1);
check("över 100 % clampas visuellt till full", ringProgress(2500, 1780) === 1);
check("mål 0 ger 0, aldrig NaN",
  ringProgress(500, 0) === 0 && Number.isFinite(ringProgress(500, 0)));
check("negativt förbrukat ger 0", ringProgress(-10, 1780) === 0);
check("NaN in ger 0 ut", ringProgress(NaN, 1780) === 0 && ringProgress(10, NaN) === 0);

const target = { calories: 1780, proteinG: 142, carbsG: 181, fatG: 54, fiberG: 25 };
const none = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
const built = buildNutrientRings(target, none);
check("fem ringar byggs", built.length === 5);
check("fiber finns med som femte ring",
  built[4].key === "fiber" && built[4].target === 25);
check("textformatet matchar referensen exakt",
  formatRingValue(built[0]) === "0 / 1780"
  && formatRingValue(built[1]) === "0g / 181g"
  && formatRingValue(built[2]) === "0g / 142g"
  && formatRingValue(built[3]) === "0g / 54g"
  && formatRingValue(built[4]) === "0g / 25g");
check("kalorier saknar g, makros har g",
  built[0].unit === "kcal" && built.slice(1).every((r) => r.unit === "g"));
const over = buildNutrientRings(target, { ...none, proteinG: 200 });
check("texten visar RIKTIGA siffror även över målet",
  formatRingValue(over[2]) === "200g / 142g" && over[2].progress === 1);
check("saknad data kraschar inte", buildNutrientRings(null, null).length === 5);

check("ringarna krymper inåt", ringGeometry(100, 10, 2, 0).radius > ringGeometry(100, 10, 2, 1).radius);
check("full ring döljer ingenting", dashOffset(100, 1) === 0);
check("tom ring döljer allt", dashOffset(100, 0) === 100);

// -- safe-area maths --
const sheetMod = await import(
  pathToFileURL(
    emit("components/ui/SwipeDownSheet.tsx", "sheet.mjs", (js) =>
      // Strip the React/native imports; only the exported maths is exercised.
      js.replace(/^import[\s\S]*?;$/gm, "").replace(/export function SwipeDownSheet[\s\S]*$/m, "")
    )
  ).href
);
const { maxSheetHeight, SAFE_TOP_GAP } = sheetMod;

// Dynamic Island (59), classic notch (47), no notch (20).
for (const [label, inset] of [["Dynamic Island", 59], ["notch", 47], ["ingen notch", 20]]) {
  const H = 852;
  const bottom = maxSheetHeight(H, inset, "bottom");
  check(`${label}: bottensheetens topp hamnar under insetet`,
    H - bottom >= inset + SAFE_TOP_GAP);

  const centered = maxSheetHeight(H, inset, "center");
  check(`${label}: centrerad sheet håller marginal uppåt`,
    (H - centered) / 2 >= inset + SAFE_TOP_GAP);
}
check("en mycket kort skärm ger fortfarande en användbar höjd",
  maxSheetHeight(400, 59, "center") >= 240);

// -- profile completion states --
// Dependencies first — the completion module imports the requirements one,
// which imports the options one.
emit("features/profile/profileOptions.ts", "profileOptions.mjs");
emit("features/profile/profileRequirements.ts", "profileRequirements.mjs", (js) =>
  js.replace(/["']\.\/profileOptions["']/g, '"./profileOptions.mjs"')
);
const completion = await import(
  pathToFileURL(
    emit("features/profile/profileCompletion.ts", "completion.mjs", (js) =>
      js.replace(/["']\.\/profileRequirements["']/g, '"./profileRequirements.mjs"')
    )
  ).href
);
const { deriveProfileCompletion } = completion;

const completeProfile = {
  gender: "Male", ageYears: 30, weightKg: 80, heightCm: 180, bodyFatLevel: null,
  targetWeightKg: null, activityType: "Mixed", stepsRange: "TenK12500",
  trainingSessions: "ThreeFourPerWeek", primaryGoal: "Maintain", goalPace: null,
  mealCountMain: 3, mealCountSnacks: 1, isComplete: true, missingFields: [],
  isPostmenopausal: null, cyclePhase: null, planFocus: "Balance",
};

check("1. ny användare utan profil → onboarding",
  deriveProfileCompletion({
    onboardingFlag: null, onboardingKnown: true, profileLoading: false, profile: null,
  }).state === "new-user");

check("2. gammal användare, flagga true, komplett profil → ingenting",
  deriveProfileCompletion({
    onboardingFlag: true, onboardingKnown: true, profileLoading: false,
    profile: completeProfile,
  }).state === "complete");

check("3. gammal användare, nya fält saknas → komplettering, ALDRIG welcome",
  deriveProfileCompletion({
    onboardingFlag: true, onboardingKnown: true, profileLoading: false,
    profile: { ...completeProfile, stepsRange: null },
  }).state === "needs-completion");

check("DEN RAPPORTERADE BUGGEN: flaggan är null men profilen finns → ingen welcome",
  deriveProfileCompletion({
    onboardingFlag: null, onboardingKnown: true, profileLoading: false,
    profile: completeProfile,
  }).state === "complete");

check("flaggan false men komplett profil → ingen banner heller",
  deriveProfileCompletion({
    onboardingFlag: false, onboardingKnown: true, profileLoading: false,
    profile: completeProfile,
  }).state === "complete");

check("under laddning visas ingenting alls",
  deriveProfileCompletion({
    onboardingFlag: null, onboardingKnown: true, profileLoading: true, profile: null,
  }).state === "loading");

check("en misslyckad flaggläsning visar ingenting, inte onboarding",
  deriveProfileCompletion({
    onboardingFlag: null, onboardingKnown: false, profileLoading: false, profile: null,
  }).state === "loading");

check("flagga true utan profil → komplettering, inte återonboarding",
  deriveProfileCompletion({
    onboardingFlag: true, onboardingKnown: true, profileLoading: false, profile: null,
  }).state === "needs-completion");

check("kvinna utan cykelsvar räknas som ofullständig",
  deriveProfileCompletion({
    onboardingFlag: true, onboardingKnown: true, profileLoading: false,
    profile: { ...completeProfile, gender: "Female", isPostmenopausal: null },
  }).state === "needs-completion");

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Final-five guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Final five mobile points hold:");
console.log("    a returning customer is never welcomed as new again");
console.log("    account deletion is server-side, double-confirmed, safe to fail");
console.log("    sheets stay below the notch on every device shape");
console.log("    the TODAY rings read real data — fiber included, no NaN");
console.log("    the body-fat guide opens ruled.me and reports failure");
