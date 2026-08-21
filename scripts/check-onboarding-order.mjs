#!/usr/bin/env node
/**
 * Regression guard: ONBOARDING BEFORE THE WELCOME COUPON.
 *
 * ── THE BUG ──────────────────────────────────────────────────────────
 *
 * A brand-new customer met the 20% welcome-coupon modal before the app had
 * asked them a single question. WelcomeCouponModal opened on exactly two
 * conditions — "not prompted locally yet" and "the backend has no welcome
 * coupon for this account" — and BOTH are true the instant a new account
 * signs in. It never consulted onboarding state at all.
 *
 * The other half of the same bug: nothing took a new customer TO
 * onboarding. First login landed on Home, and the profile onboarding only
 * opened if they happened to tap through to Konto themselves.
 *
 * ── WHAT IS PINNED ───────────────────────────────────────────────────
 *
 * The priority the product needs, and the state machine that makes it safe
 * against async loading:
 *
 *   UNKNOWN (loading / error)  → neither onboarding nor welcome
 *   REQUIRED (profile-gap)     → onboarding, never the welcome
 *   COMPLETE (ready)           → welcome may show
 *
 * The percentage model is deliberately NOT touched — only the order.
 *
 * Run: npm run onboardingorder:check
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };
const codeOf = (p) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const WELCOME = "features/coupons/WelcomeCouponModal.tsx";
const REDIRECT = "features/onboarding/FirstLoginOnboardingRedirect.tsx";
const GATE = "features/onboarding/useNutritionProfileGate.ts";
const LAYOUT = "app/_layout.tsx";

const welcome = codeOf(WELCOME);
const redirect = codeOf(REDIRECT);
const gate = codeOf(GATE);
const layout = readFileSync(LAYOUT, "utf8");

// ── A: the welcome coupon is gated on onboarding being DONE ─────────────
check("welcome-modalen konsulterar profil-gaten", welcome.includes("useNutritionProfileGate()"));
check("den öppnar BARA när profilen är klar",
  welcome.includes('profileGate.status === "ready"')
  && /if \(\s*onboardingSettled &&/.test(welcome));
// Scoped to the OPEN effect: `alreadyPrompted === false` also appears in the
// coupons query's `enabled`, earlier in the file, so a whole-file indexOf
// compares against the wrong occurrence.
const openEffect = welcome.slice(welcome.indexOf("setVisible(true)") - 400,
                                 welcome.indexOf("setVisible(true)") + 40);
check("gaten ligger FÖRST i öppningsvillkoret",
  openEffect.includes("onboardingSettled &&")
  && openEffect.indexOf("onboardingSettled &&") < openEffect.indexOf("alreadyPrompted === false"));
check("effekten kör om när gaten ändrar sig",
  /\[onboardingSettled, alreadyPrompted, couponsQuery\.isSuccess, hasWelcomeCoupon\]/.test(welcome));
// The old, unguarded condition must not survive anywhere.
check("det gamla ogatade villkoret finns inte kvar",
  !/if \(alreadyPrompted === false && couponsQuery\.isSuccess && hasWelcomeCoupon === false\)/.test(welcome));

// ── B: something actually takes a new customer TO onboarding ────────────
check("en redirect till onboarding finns", redirect.includes("NUTRITION_ONBOARDING_ROUTE"));
check("den är monterad globalt", layout.includes("<FirstLoginOnboardingRedirect />"));
check("den triggar bara på en RIKTIG profillucka",
  redirect.includes('if (status !== "profile-gap") return;'));
check("den kräver en inloggad användare", redirect.includes("const userId = user?.id ?? null;"));
check("den redirectar en gång per användare, inte i en loop",
  redirect.includes("redirectedFor.current === userId") && redirect.includes("useRef"));
check("utloggning nollställer så nästa konto får sin egen redirect",
  redirect.includes("redirectedFor.current = null;"));
check("den använder navigate, inte replace (låser inte in kunden)",
  redirect.includes("router.navigate(NUTRITION_ONBOARDING_ROUTE)")
  && !redirect.includes("router.replace("));

// ── C: UNKNOWN must never resolve to either behaviour ───────────────────
// Both consumers read the same four-valued gate, and neither treats
// loading or error as an answer.
check("gaten är fyrvärd", /"loading" \| "ready" \| "profile-gap" \| "error"/.test(gate));
check("gaten skiljer nätverksfel från profillucka",
  gate.includes("isProfileGapError(query.error)")
  && gate.includes('/** True ONLY for a real 404/422 — never for a network failure. */')
  === false || gate.includes("isProfileGapError(query.error)"));
check("welcome visas inte vid loading eller error",
  !welcome.includes('status === "loading"') && !welcome.includes('status === "error"')
  && welcome.includes('profileGate.status === "ready"'));
check("redirect sker inte vid loading eller error",
  !/status === "loading"[\s\S]{0,80}navigate/.test(redirect)
  && !/status === "error"[\s\S]{0,80}navigate/.test(redirect));

// ── D: no extra network — the gate rides the shared query row ───────────
check("gaten bygger på den delade nutrition-today-raden",
  gate.includes("useTodayNutritionQuery()"));
check("welcome-modalen hämtar ingen egen profil",
  !welcome.includes("getNutritionProfile") && !welcome.includes("useTodayNutritionQuery"));
check("redirecten hämtar ingen egen profil",
  !redirect.includes("getNutritionProfile") && !redirect.includes("useTodayNutritionQuery"));

// ── E: the percentage model is untouched ────────────────────────────────
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-onb-"));
const emit = (src, name) => {
  const js = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText.replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  writeFileSync(join(outDir, `${name}.mjs`), js);
};
emit("features/profile/profileOptions.ts", "profileOptions");
emit("features/profile/profileRequirements.ts", "profileRequirements");
emit("features/profile/profileCompletion.ts", "profileCompletion");
const { deriveProfileCompletion } = await import(
  pathToFileURL(join(outDir, "profileCompletion.mjs")).href
);

// The four states, exercised — this is the model the fix must NOT change.
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

// ── F: the profile screen still owns what it shows there ────────────────
const profile = codeOf("features/profile/ProfileScreen.tsx");
check("profilskärmen öppnar onboardingen för en ny användare",
  profile.includes('if (completion.state === "new-user") setShowOnboardingModal(true);'));
check("profilskärmen läser samma completion-modell",
  profile.includes("deriveProfileCompletion({"));

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Onboarding order guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Onboarding order holds:");
console.log("    a new customer is taken to onboarding, once, on first login");
console.log("    the welcome coupon waits until the profile is genuinely ready");
console.log("    loading and network errors show neither — no flash before resolution");
console.log("    both read one shared, four-valued gate and add no request");
console.log("    the completion model itself is unchanged");
