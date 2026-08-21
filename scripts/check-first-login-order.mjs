#!/usr/bin/env node
/**
 * Regression guard: THE FIRST-LOGIN ORDER.
 *
 *   signup → confirm mail → login
 *     1. ONBOARDING          FirstRunOnboardingGate / IntroCarousel
 *     2. WELCOME DISCOUNT    WelcomeCouponModal (20%)
 *     3. FILL PROFILE        ProfileScreen — "Vill du ange din kostprofil nu?"
 *     → normal flow
 *
 * ── THE BUG ──────────────────────────────────────────────────────────
 *
 * A brand-new account signed in and was met by step 3 immediately.
 *
 * Two opposite mistakes, both from letting each step decide alone:
 *
 *   FirstLoginOnboardingRedirect navigated to Konto the moment the
 *   backend reported `profile-gap` — which is true from the very first
 *   instant a new account exists. Konto opens the profile prompt on
 *   arrival, so step 3 fired while the intro was still on screen.
 *
 *   WelcomeCouponModal waited for `profileGate === "ready"`, i.e. for a
 *   COMPLETE nutrition profile — which put step 2 AFTER step 3.
 *
 * Priority cannot be an emergent property of three async races. This
 * guard pins that it is stated once, in a pure function, and that all
 * three components obey it.
 *
 * This supersedes check-onboarding-order.mjs, whose assertions pinned
 * the inverted order above (they required exactly the two conditions
 * listed as mistakes). Everything that guard got RIGHT is kept below:
 * unknown is never a verdict, no step adds a request, and the profile
 * percentage model is not touched.
 *
 * Run: npm run firstloginorder:check
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };
/** A missing file yields "" instead of a crash, so deleting the very
 * machine this guard protects reports named failures, not a stack trace. */
const codeOf = (p) =>
  existsSync(p)
    ? readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    : "";

const FLOW = "features/onboarding/firstLoginFlow.ts";
const HOOK = "features/onboarding/useFirstLoginFlow.ts";
const INTRO_GATE = "features/onboarding/FirstRunOnboardingGate.tsx";
const INTRO_STORE = "features/onboarding/introStorage.ts";
const WELCOME = "features/coupons/WelcomeCouponModal.tsx";
const WELCOME_STATUS = "features/coupons/useWelcomeCouponStatus.ts";
const REDIRECT = "features/onboarding/FirstLoginOnboardingRedirect.tsx";
const PROFILE = "features/profile/ProfileScreen.tsx";

const hook = codeOf(HOOK);
const introGate = codeOf(INTRO_GATE);
const introStore = codeOf(INTRO_STORE);
const welcome = codeOf(WELCOME);
const welcomeStatus = codeOf(WELCOME_STATUS);
const redirect = codeOf(REDIRECT);
const profile = codeOf(PROFILE);

// ── The pure machine, exercised for real ────────────────────────────────
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-flow-"));
const emit = (src, name) => {
  const js = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText.replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  writeFileSync(join(outDir, `${name}.mjs`), js);
};
check("prioriteringen finns som en ren, testbar funktion", existsSync(FLOW));
check("orkestreringen finns som EN delad hook", existsSync(HOOK));
check("welcome-status finns som en delad modul", existsSync(WELCOME_STATUS));

/** No machine → every ordering assertion below fails by name. */
let deriveFirstLoginStep = () => ({ step: "MISSING" });
if (existsSync(FLOW)) {
  emit(FLOW, "firstLoginFlow");
  ({ deriveFirstLoginStep } = await import(
    pathToFileURL(join(outDir, "firstLoginFlow.mjs")).href
  ));
}

/** Everything settled except what a case overrides. */
const at = (over) =>
  deriveFirstLoginStep({
    signedIn: true,
    introSeen: true,
    welcomeHandled: true,
    profileGate: "ready",
    ...over,
  }).step;

// ── A: THE ORDER ITSELF, step by step through a new account ─────────────
check("1. en helt ny användare möter ONBOARDING",
  at({ introSeen: false, welcomeHandled: false, profileGate: "profile-gap" }) === "onboarding");
check("2. när onboardingen är klar kommer WELCOME DISCOUNT",
  at({ introSeen: true, welcomeHandled: false, profileGate: "profile-gap" }) === "welcome-discount");
check("3. när rabatten är hanterad kommer FILL PROFILE",
  at({ introSeen: true, welcomeHandled: true, profileGate: "profile-gap" }) === "profile-prompt");
check("4. därefter normalt flöde",
  at({ introSeen: true, welcomeHandled: true, profileGate: "ready" }) === "ready");

// The inverted order that caused the bug: a profile gap must NEVER win
// while an earlier step is still outstanding.
check("profillucka slår INTE igenom under onboardingen",
  at({ introSeen: false, profileGate: "profile-gap" }) === "onboarding");
check("profillucka slår INTE igenom före rabatten",
  at({ welcomeHandled: false, profileGate: "profile-gap" }) === "welcome-discount");
check("rabatten väntar INTE på en färdig profil",
  at({ welcomeHandled: false, profileGate: "profile-gap" }) === "welcome-discount"
  && at({ welcomeHandled: false, profileGate: "ready" }) === "welcome-discount");

// ── B: returning users are not dragged through any of it ────────────────
check("en returnerande kund möter ingenting",
  at({}) === "ready");
check("en returnerande kund med en ofullständig profil får prompten, inte rabatten",
  at({ profileGate: "profile-gap" }) === "profile-prompt");

// ── C: restart at every point in the sequence ───────────────────────────
// The flags are persisted, so a cold start resumes rather than restarts.
check("omstart mitt i onboardingen → fortfarande onboarding",
  at({ introSeen: false, welcomeHandled: null, profileGate: "loading" }) === "onboarding");
check("omstart efter onboarding men före rabatten → rabatten",
  at({ introSeen: true, welcomeHandled: false, profileGate: "loading" }) === "welcome-discount");
check("omstart efter rabatten → profil-prompten",
  at({ introSeen: true, welcomeHandled: true, profileGate: "profile-gap" }) === "profile-prompt");

// ── D: nytt konto efter delete ──────────────────────────────────────────
// Intro is device-scoped (nutri_intro_seen_v1, no user id) and stays seen;
// the two PER-USER steps run again for the new account. Pinned because it
// is a deliberate product decision, not an accident of key naming.
check("intro-flaggan är device-scopad, inte per användare",
  introStore.includes('export const INTRO_SEEN_KEY = "nutri_intro_seen_v1";')
  && !/INTRO_SEEN_KEY \+ (userId|user)/.test(introStore));
check("nytt konto på samma telefon: rabatt + profil-prompt kommer igen",
  at({ introSeen: true, welcomeHandled: false, profileGate: "profile-gap" }) === "welcome-discount");
check("welcome-flaggan är per användare",
  welcomeStatus.includes("WELCOME_PROMPTED_KEY_PREFIX + userId"));
check("den läses om när användaren byts",
  /useEffect\(\(\) => \{[\s\S]{0,600}\}, \[userId\]\);/.test(welcomeStatus));

// ── E: UNKNOWN IS NEVER A VERDICT ───────────────────────────────────────
// Any unknown that sits BEFORE the step in question must show nothing.
check("utloggad → ingenting", at({ signedIn: false, introSeen: false }) === "loading");
check("oläst intro-flagga → ingenting", at({ introSeen: null }) === "loading");
check("okänt welcome-läge → ingenting", at({ welcomeHandled: null }) === "loading");
check("profil-gaten laddar → ingenting", at({ profileGate: "loading" }) === "loading");
check("nätverksfel är ingen profillucka", at({ profileGate: "error" }) === "loading");
check("en oläst intro-flagga får inte visa rabatten",
  at({ introSeen: null, welcomeHandled: false }) === "loading");
check("ett okänt welcome-läge får inte visa profil-prompten",
  at({ welcomeHandled: null, profileGate: "profile-gap" }) === "loading");

// ── F: all three components obey the machine ────────────────────────────
check("intro-gaten och flödet läser SAMMA intro-signal",
  introGate.includes("useIntroSeen()") && !introGate.includes("useState<boolean | null>"));
check("intro-timeouten är delad, inte privat",
  introStore.includes("export function loadIntroSeenWithTimeout()")
  && !introGate.includes("READ_TIMEOUT_MS"));
check("welcome-modalen frågar flödet",
  welcome.includes("useFirstLoginFlow()"));
check("welcome-modalen öppnar BARA på sin tur",
  /if \(step === "welcome-discount"\) \{\s*setVisible\(true\);\s*\} else \{/.test(welcome));
check("redirecten frågar flödet",
  redirect.includes("useFirstLoginFlow()"));
check("redirecten navigerar BARA på sin tur",
  redirect.includes('if (step !== "profile-prompt") return;'));
check("profil-prompten frågar flödet",
  profile.includes("useFirstLoginFlow()"));
check("profil-prompten öppnar BARA på sin tur",
  profile.includes('const isOurTurn = firstLogin.step === "profile-prompt";')
  && profile.includes("setShowOnboardingModal(isNewUser && isOurTurn);"));
check("prompten kräver fortfarande en genuint ny användare",
  profile.includes('const isNewUser = completion.state === "new-user";'));

// ── G: the two old, inverted conditions cannot come back ────────────────
check("welcome-modalen väntar inte längre på en klar profil",
  !welcome.includes('profileGate.status === "ready"')
  && !welcome.includes("useNutritionProfileGate"));
check("redirecten triggar inte längre på en rå profillucka",
  !redirect.includes('status !== "profile-gap"')
  && !redirect.includes("useNutritionProfileGate"));
check("profil-prompten öppnar inte längre ogatad",
  !profile.includes('if (completion.state === "new-user") setShowOnboardingModal(true);'));

// ── H: one machine, and it costs no extra network ───────────────────────
check("prioriteringen står på EN plats", hook.includes("deriveFirstLoginStep({"));
check("flödet läser den delade nutrition-raden, inte en egen",
  hook.includes("useNutritionProfileGate()")
  && !hook.includes("useQuery(") && !hook.includes("getNutritionProfile"));
check("welcome-status återanvänder den delade kupong-raden",
  welcomeStatus.includes('queryKey: ["coupons", userId]')
  && welcomeStatus.includes("enabled: !!userId && !authLoading && prompted === false"));
check("welcome-modalen hämtar inget själv",
  !welcome.includes("useQuery(") && !welcome.includes("getMyCoupons"));
check("redirecten hämtar inget själv",
  !redirect.includes("useQuery(") && !redirect.includes("getMyCoupons"));
check("ingen falsk coupon-state skapas för att komma vidare",
  !welcomeStatus.includes("claimWelcomeCoupon") && !hook.includes("claimWelcomeCoupon"));

// ── I: the profile percentage model is untouched ────────────────────────
emit("features/profile/profileOptions.ts", "profileOptions");
emit("features/profile/profileRequirements.ts", "profileRequirements");
emit("features/profile/profileCompletion.ts", "profileCompletion");
const { deriveProfileCompletion } = await import(
  pathToFileURL(join(outDir, "profileCompletion.mjs")).href
);
check("okänt läge säger ingenting alls",
  deriveProfileCompletion({
    onboardingFlag: null, onboardingKnown: false, profileLoading: true, profile: null,
  }).state === "loading");
check("en misslyckad flaggläsning är inte 'ny användare'",
  deriveProfileCompletion({
    onboardingFlag: null, onboardingKnown: false, profileLoading: false, profile: null,
  }).state === "loading");
check("ingen profil och aldrig onboardad = ny användare",
  deriveProfileCompletion({
    onboardingFlag: null, onboardingKnown: true, profileLoading: false, profile: null,
  }).state === "new-user");
check("en befintlig kund välkomnas aldrig igen",
  deriveProfileCompletion({
    onboardingFlag: true, onboardingKnown: true, profileLoading: false, profile: null,
  }).state === "needs-completion");
const fullProfile = {
  gender: "Male", ageYears: 30, weightKg: 80, heightCm: 180, bodyFatLevel: null,
  activityType: "Mixed", stepsRange: "Under5K", trainingSessions: "None",
  primaryGoal: "Maintain", goalPace: null, planFocus: "Balance",
  isPostmenopausal: null, cyclePhase: null,
};
check("en komplett profil kräver ingenting",
  deriveProfileCompletion({
    onboardingFlag: false, onboardingKnown: true, profileLoading: false, profile: fullProfile,
  }).state === "complete");
check("en profil som finns slår flaggan (aldrig ny användare igen)",
  deriveProfileCompletion({
    onboardingFlag: null, onboardingKnown: true, profileLoading: false, profile: fullProfile,
  }).state !== "new-user");

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ First-login order guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ First-login order holds:");
console.log("    1. ONBOARDING → 2. WELCOME DISCOUNT → 3. FILL PROFILE → normal flow");
console.log("    a later step can never win before an earlier one is settled");
console.log("    unknown and network errors show NOTHING — no step guesses");
console.log("    a cold start resumes the sequence where it stopped");
console.log("    all three components read one machine and add no request");
console.log("    the profile percentage model is unchanged");
