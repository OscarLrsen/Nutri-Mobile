#!/usr/bin/env node
/**
 * Regression guard for the signup verification fallback and the dead
 * GO_BACK dispatch.
 *
 * THE BUGS.
 *
 * "Jag har verifierat" asked `getSession()` and treated a null answer as
 * "not verified". getSession() only reads LOCAL STORAGE — it never asks the
 * server. After an ordinary e-mail verification the app has no local
 * session (signUp with confirmation required returns session: null, and
 * clicking the link in a browser establishes a session there, not here), so
 * a confirmed account was told it was unverified while logging in on the
 * next screen with the same credentials worked immediately.
 *
 * LoginScreen.goNext() called router.back() after a successful sign-in.
 * Signing in rebuilds the navigator — the signed-out group that owned this
 * screen's history is removed — so canGoBack() was read before the rebuild
 * and GO_BACK dispatched after it, into a navigator with nothing to handle
 * it.
 *
 * Run: npm run signup:check
 */

import { readFileSync } from "node:fs";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

const register = readFileSync("features/auth/RegisterScreen.tsx", "utf8");
const login = readFileSync("features/auth/LoginScreen.tsx", "utf8");

// ── "I have verified" ───────────────────────────────────────────────────
check("en befintlig session är fortfarande snabbvägen",
  register.includes("supabase.auth.getSession()")
  && register.includes("if (data.session)"));
check("utan session frågas SERVERN, inte lokal lagring",
  register.includes("supabase.auth.signInWithPassword({ email, password })"));
check("bara email_not_confirmed betyder 'inte verifierad'",
  register.includes('error.code === "email_not_confirmed"')
  && register.includes("/not confirmed/i.test(error.message)"));
check("nätfel rapporteras som nätfel, inte som overifierat",
  register.includes('setVerifyMessage("failed")')
  && register.includes('setVerifyMessage(notConfirmed ? "notConfirmed" : "failed")'));
check("saknat lösenord skickar till login med e-posten förifylld",
  register.includes('router.replace({ pathname: "/logga-in", params: { email } })'));
check("knappen låser aldrig upp sig själv utan bevis",
  !/setVerifyMessage\(null\)[\s\S]{0,80}goNext\(\)/.test(register));
check("checking-flaggan släpps alltid",
  register.includes("} finally {") && register.includes("setChecking(false)"));
check("den gamla session-only-grinden är borta",
  !register.includes("setSessionError") && !register.includes('t("auth.noSession")'));
check("samtycken skickas fortfarande innan man går vidare",
  register.includes("await submitConsentsOnce();"));

// ── GO_BACK ─────────────────────────────────────────────────────────────
// Pinned on CALLS, not prose: the header and goNext both explain at length
// why this screen must not go backwards, and that explanation is the point.
const loginCalls = login.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("login navigerar aldrig bakåt efter inloggning",
  !loginCalls.includes("router.back(") && !loginCalls.includes("canGoBack("));
check("login ersätter i stället för att gissa på en stack",
  login.includes('router.replace("/(tabs)")'));
check("deep-link-avsikten (next) vinner fortfarande",
  login.includes("if (next && next.startsWith(\"/\"))")
  && login.includes("router.replace(next as Href)"));
check("registreringens bakåtknapp har kvar sin fallback",
  register.includes("router.canGoBack()") && register.includes('router.replace("/logga-in")'));

// ── login accepts the prefill ───────────────────────────────────────────
check("login tar emot förifylld e-post",
  login.includes("email: prefillEmail") || login.includes("email?: string"));
check("förifyllningen används som startvärde",
  login.includes("useState(prefillEmail ?? \"\")"));

// ── copy ────────────────────────────────────────────────────────────────
for (const locale of ["sv", "en", "da"]) {
  const json = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, "utf8"));
  check(`${locale}: "inte bekräftad än"-copy finns`,
    typeof json.auth?.notConfirmedYet === "string");
  check(`${locale}: nätfelscopy finns`, typeof json.auth?.verifyFailed === "string");
  check(`${locale}: den missvisande noSession-texten är borta`,
    json.auth?.noSession === undefined);
}

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Signup verify guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Signup verification fallback holds:");
console.log("    a verified account is never told it is unverified");
console.log("    only email_not_confirmed means not confirmed");
console.log("    login replaces instead of dispatching a dead GO_BACK");
