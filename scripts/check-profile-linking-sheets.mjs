#!/usr/bin/env node
/**
 * Regression guard for the five-point QA batch. Pins the fixes that are
 * invisible in a screenshot and easy to undo by accident:
 *
 *   1  the confirmation mail returns to the APP (web bridge + deep-link
 *      handler), never to a dead Safari page,
 *   2  "Redigera min profil" collects every field the engine reads, a save
 *      cannot invent the missing ones, and an edit cannot wipe the female
 *      cycle answers,
 *   3  bottom sheets dismiss on a downward drag, and cannot be dragged away
 *      mid-save,
 *   4  the body-fat guide is in-app and gender-specific, with no
 *      "Hoppa över".
 *
 * Run: npm run profile:check
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

// ── 1: e-postbekräftelsen leder tillbaka till appen ─────────────────────
const register = readFileSync("features/auth/RegisterScreen.tsx", "utf8");
check("registreringen pekar på webb-bryggan, inte webbens egen callback",
  register.includes("/auth/app?return=")
  && !register.includes("/auth/callback?next="));
check("returadressen byggs från appens eget schema (staging vs production)",
  register.includes('Linking.createURL("auth/callback")')
  && register.includes("encodeURIComponent(appReturnUrl)"));
check("ingen hårdkodad localhost i redirecten",
  !/localhost/i.test(register));

const deepLink = readFileSync("services/auth/AuthDeepLinkHandler.tsx", "utf8");
check("både kallstart och varmstart fångas",
  deepLink.includes("getInitialURL()") && deepLink.includes('addEventListener("url"'));
check("sessionen sätts från länken", deepLink.includes("supabase.auth.setSession"));
check("tokens läses ur fragmentet, inte bara query", deepLink.includes('url.indexOf("#")'));
check("halva tokenpar avvisas",
  /access_token\s*&&\s*refresh_token|!accessToken\s*\|\|\s*!refreshToken/.test(deepLink));

const layout = readFileSync("app/_layout.tsx", "utf8");
check("deep-link-lyssnaren är monterad i _layout (utanför Stack.Protected)",
  layout.includes("<AuthDeepLinkHandler />"));

// ── 2: profilen samlar allt algoritmen läser ────────────────────────────
const profileSrc = readFileSync("features/profile/ProfileScreen.tsx", "utf8");
check("en ny profil förifylls INTE med kön/aktivitet/mål",
  /gender:\s*null/.test(profileSrc)
  && /activityType:\s*null/.test(profileSrc)
  && /primaryGoal:\s*null/.test(profileSrc));
check("sparningen skickar de kvinnospecifika fälten (annars nollas de)",
  profileSrc.includes("isPostmenopausal: menopauseToApi(form.menopause)")
  && profileSrc.includes('cyclePhase: form.menopause === "Cycling"'));
check("planFocus kommer från formuläret, inte från ett andra state",
  profileSrc.includes("planFocus: form.planFocus")
  && !profileSrc.includes("PLAN_FOCUS_MAP")
  && !profileSrc.includes("mapPlanFocusBack"));
check("en ofullständig profil kan inte sparas med gissade värden",
  profileSrc.includes("if (!isProfileComplete(form)) return null;")
  && profileSrc.includes('setSaveError(t("profile.errorIncomplete"))'));
check("viktgenvägen sparar lagrad profil + ny vikt (ingen återställning)",
  profileSrc.includes("buildDtoFromStoredProfile(nutritionProfile), weightKg:"));

const modal = readFileSync("features/profile/EditSectionModal.tsx", "utf8");
// The first run used to render the basics only and let the save fill the
// rest from EMPTY_FORM's defaults; every block now hangs off showAll.
check("nya profiler ser samma formulär som befintliga",
  modal.includes("const showAll = combined || isNewProfile;")
  && modal.includes('{(section === "aktivitet" || showAll) && (')
  && modal.includes('{(section === "mal" || showAll) && (')
  && modal.includes("{showAll && (")
  && !/\|\|\s*combined\)\s*&&\s*!isNewProfile/.test(modal));
check("spara är spärrat medan obligatoriska fält saknas",
  modal.includes("disabled={saving || saveDone || gateSave}"));
check("det som saknas listas med namn", modal.includes("profile.missingStep."));
// THIS ASSERTION USED TO PIN THE BUG. It required `nextIncompleteAnchor`
// plus an inline `scrollRef.current?.scrollTo` — i.e. exactly the top-down
// search and the raw scroll call that made the sheet jump BACKWARDS to an
// earlier question. Both are gone; the rule now lives in profileProgression
// and the mechanics in useProfileProgression, which is what is pinned here.
// The forward-only behaviour itself is exercised for real in
// check-profile-scroll.mjs.
check("auto-progression har ETT system, och det scrollar inte själv",
  modal.includes("useProfileProgression()")
  && modal.includes("progression.advanceFrom(from, { ...form, ...patch })")
  && !modal.includes("nextIncompleteAnchor")
  && !/scrollRef\.current\?\.scrollTo/.test(modal));

// ── 3: svep nedåt stänger bottensheets ──────────────────────────────────
const swipe = readFileSync("components/ui/SwipeDownSheet.tsx", "utf8");
check("gesten bygger på projektets befintliga stack",
  swipe.includes("react-native-gesture-handler") && swipe.includes("react-native-reanimated"));
check("bara nedåt stänger", swipe.includes("DISMISS_DISTANCE") && swipe.includes("DISMISS_VELOCITY"));
check("enabled=false fryser gesten helt", swipe.includes(".enabled(enabled)"));

for (const [file, guard] of [
  ["features/profile/EditSectionModal.tsx", "enabled={!saving && !saveDone}"],
  ["features/profile/TrainingScheduleSheet.tsx", "enabled={!saving}"],
  ["features/rewards/RegularDropSheet.tsx", "enabled={!busy}"],
]) {
  const src = readFileSync(file, "utf8");
  check(`${file} kan inte svepas bort mitt i en sparning`,
    src.includes("<SwipeDownSheet") && src.includes(guard));
}
for (const file of [
  "components/language/LanguagePickerSheet.tsx",
  "features/rewards/SpinNudgeSheet.tsx",
]) {
  check(`${file} går att svepa ned`, readFileSync(file, "utf8").includes("<SwipeDownSheet"));
}

// ── 4: kroppsfettsguiden ────────────────────────────────────────────────
// REVERSED by a later decision: the guide is the EXTERNAL ruled.me page
// again, because it has photographs at each percentage and our own list of
// numbers did not. What must not come back is the silent failure.
check("guiden öppnar exakt ruled.me-URL:en",
  modal.includes('"https://www.ruled.me/visually-estimate-body-fat-percentage/"'));
check("den interna guide-modalen är helt borta",
  !modal.includes("guideOpen")
  && !modal.includes("guideBackdrop")
  && !modal.includes("guideCard")
  && !modal.includes("bodyFatGuideIntro"));
check("öppningen kan inte misslyckas tyst",
  modal.includes("Linking.canOpenURL")
  && modal.includes("Linking.openURL")
  && /catch\s*\{[\s\S]{0,120}Alert\.alert/.test(modal));
check("chippet är fortfarande könsspecifikt i texten",
  modal.includes('form.gender === "Female"')
  && modal.includes("bodyFatGuideFemale")
  && modal.includes("bodyFatGuideMale"));
check('"Hoppa över" finns inte kvar i profilformuläret',
  !modal.includes('t("profile.skip")') && !modal.includes("unsureSkip"));

for (const locale of ["sv", "en", "da"]) {
  const json = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, "utf8"));
  check(`${locale}: felmeddelande för guiden finns`,
    typeof json.profile?.bodyFatGuideErrorTitle === "string"
    && typeof json.profile?.bodyFatGuideErrorBody === "string");
  check(`${locale}: den döda guide-introtexten är borta`,
    json.profile?.bodyFatGuideIntro === undefined);
  check(`${locale}: den gamla skip-texten är borta`, json.profile?.unsureSkip === undefined);
  check(`${locale}: fokus- och cykelval är översatta`,
    typeof json.profileOptions?.planFocus?.Balance?.label === "string"
    && typeof json.profileOptions?.cyclePhase?.Luteal?.label === "string"
    && typeof json.profileOptions?.menopause?.PreferNotToSay?.label === "string");
}

// ── 2b: kravlistan testas på riktigt, inte bara som text ────────────────
// profileRequirements is pure TS (its only runtime import is the equally
// pure profileOptions), so it can be transpiled and exercised directly.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-profile-"));
const emit = (src, name, rewrite = (s) => s) => {
  const js = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const out = join(outDir, name);
  writeFileSync(out, rewrite(js));
  return out;
};
emit("features/profile/profileOptions.ts", "profileOptions.mjs");
const reqMod = emit("features/profile/profileRequirements.ts", "profileRequirements.mjs", (js) =>
  js.replace(/["']\.\/profileOptions["']/g, '"./profileOptions.mjs"')
);
const { missingRequiredSteps, isProfileComplete } = await import(pathToFileURL(reqMod).href);

const base = {
  gender: "Male", ageYears: "30", weightKg: "80", heightCm: "180",
  bodyFatLevel: null, activityType: "Mixed", stepsRange: "TenK12500",
  trainingSessions: "ThreeFourPerWeek", primaryGoal: "Maintain", goalPace: null,
  planFocus: "Balance", menopause: null, cyclePhase: null,
};

check("en ifylld manlig profil är komplett", isProfileComplete(base));
check("kroppsfett är fortfarande frivilligt", isProfileComplete({ ...base, bodyFatLevel: null }));
check("steg är obligatoriskt (null = 0 poäng, inte 'okänt')",
  missingRequiredSteps({ ...base, stepsRange: null }).includes("steps"));
check("träning är obligatoriskt",
  missingRequiredSteps({ ...base, trainingSessions: null }).includes("training"));
check("takt krävs för FatLoss men inte för Maintain",
  missingRequiredSteps({ ...base, primaryGoal: "FatLoss", goalPace: null }).includes("pace")
  && !missingRequiredSteps(base).includes("pace"));
check("en takt som inte hör till målet räknas inte som ifylld",
  missingRequiredSteps({ ...base, primaryGoal: "FatLoss", goalPace: "Careful" }).includes("pace"));
check("planFocus måste väljas", missingRequiredSteps({ ...base, planFocus: null }).includes("planFocus"));
check("cykelfrågan ställs bara till kvinnor",
  !missingRequiredSteps(base).includes("menopause")
  && missingRequiredSteps({ ...base, gender: "Female" }).includes("menopause"));
check('"vill inte ange" räknas som ett svar',
  isProfileComplete({ ...base, gender: "Female", menopause: "PreferNotToSay" }));
check("fasen krävs bara vid aktiv cykel",
  missingRequiredSteps({ ...base, gender: "Female", menopause: "Cycling" }).includes("cyclePhase")
  && !missingRequiredSteps({ ...base, gender: "Female", menopause: "Postmenopausal" })
        .includes("cyclePhase"));
check("orimliga kroppsmått blockerar sparning",
  missingRequiredSteps({ ...base, weightKg: "8" }).includes("numbers")
  && missingRequiredSteps({ ...base, ageYears: "" }).includes("numbers"));

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Profile/linking/sheet guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Five-point QA fixes hold:");
console.log("    confirmation mail returns to the app, not a dead Safari page");
console.log("    profile collects every field the engine reads — no invented defaults");
console.log("    a profile edit can no longer wipe the female cycle answers");
console.log("    bottom sheets swipe down, but never mid-save");
console.log("    the body-fat guide opens ruled.me and cannot fail silently");
