#!/usr/bin/env node
/**
 * Regression guard for the delete-account auth reset.
 *
 * THE BUG. `auth/callback` was added outside both Stack.Protected groups so
 * the confirmation deep link would resolve in either auth state. That made
 * it permanently available — and it was declared FIRST, so it became the
 * screen the navigator falls back to when the focused route is guarded
 * away. After account deletion (or any sign-out) the app landed there and
 * sat on "Signing you in…" with nothing to sign in.
 *
 * Five things must stay true:
 *   1  a successful delete can never leave the callback route showing,
 *   2  signing out with the callback mounted ends on login,
 *   3  a stale callback falls back instead of spinning forever,
 *   4  a real confirmation link still signs the customer in,
 *   5  a consumed link is never processed twice.
 *
 * Run: npm run authreset:check
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

const layout = readFileSync("app/_layout.tsx", "utf8");
const callback = readFileSync("app/auth/callback.tsx", "utf8");
const handler = readFileSync("services/auth/AuthDeepLinkHandler.tsx", "utf8");
const del = readFileSync("features/profile/DeleteAccountSection.tsx", "utf8");

// ── The fallback slot ───────────────────────────────────────────────────
// This is the actual root cause. The navigator's documented contract is
// that an unavailable route lands on "the first available screen: login".
// The callback route is always available, so it must not be first.
const callbackIdx = layout.indexOf('<Stack.Screen name="auth/callback" />');
const loginIdx = layout.indexOf('<Stack.Screen name="logga-in" />');
const firstGuardIdx = layout.indexOf("<Stack.Protected");

check("callback-routen finns kvar (annars återkommer 404:an)", callbackIdx > 0);
check("callback-routen är INTE första tillgängliga skärm",
  callbackIdx > firstGuardIdx);
check("login deklareras före callback-routen", loginIdx > 0 && loginIdx < callbackIdx);
check("callback-routen ligger fortfarande utanför båda guards",
  callbackIdx > layout.lastIndexOf("</Stack.Protected>"));

// ── The screen can leave ────────────────────────────────────────────────
check("skärmen lämnar till login när ingenting bearbetas",
  callback.includes('router.replace("/logga-in")'));
check("skärmen lämnar in i appen när sessionen finns",
  callback.includes('router.replace("/(tabs)")'));
check("skärmen väntar på en riktig exchange innan den ger upp",
  callback.includes("START_GRACE_MS") && callback.includes("graceOver && !linkInFlight"));
check("en exchange som aldrig blir klar strandar inte kunden",
  callback.includes("MAX_WAIT_MS") && callback.includes("waitedTooLong"));
check("inget beslut fattas medan auth-state fortfarande läses",
  callback.includes("if (loading) return;"));
check("skärmen gör fortfarande ingen egen auth",
  !callback.includes("setSession") && !callback.includes("supabase"));

// ── The handler reports in-flight state ─────────────────────────────────
check("handlern annonserar att en exchange pågår",
  handler.includes("beginAuthLink()"));
check("handlern släpper väntan även när exchangen misslyckas",
  handler.includes("} finally {") && handler.includes("endAuthLink();"));
check("tokenhanteringen är oförändrad (confirmation fungerar fortfarande)",
  handler.includes("supabase.auth.setSession")
  && handler.includes("getInitialURL()")
  && handler.includes('addEventListener("url"'));
check("en redan konsumerad länk körs inte om",
  handler.includes("handledRef.current === url"));

// ── Delete does not depend on fallback semantics ────────────────────────
check("delete navigerar explicit till login efter signOut",
  del.includes('router.replace("/logga-in")')
  && del.indexOf("await signOut()") < del.indexOf('router.replace("/logga-in")'));
check("cachen töms fortfarande före utloggning",
  del.indexOf("queryClient.clear()") < del.indexOf("await signOut()"));
check("ett misslyckat delete navigerar ingenstans",
  !/catch\s*\{[\s\S]{0,200}router\.replace/.test(del));

// ── Behavioural: the in-flight registry ─────────────────────────────────
const require = createRequire(import.meta.url);
const ts = require("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-authreset-"));
const js = ts.transpileModule(readFileSync("services/auth/authLinkActivity.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = join(outDir, "authLinkActivity.mjs");
writeFileSync(mod, js);
const {
  beginAuthLink,
  endAuthLink,
  isAuthLinkInFlight,
  subscribeAuthLinkActivity,
  resetAuthLinkActivityForTests,
} = await import(pathToFileURL(mod).href);

resetAuthLinkActivityForTests();
check("inget pågår från början — så en fallback-landning lämnar direkt",
  isAuthLinkInFlight() === false);

beginAuthLink();
check("en riktig länk markeras som pågående", isAuthLinkInFlight() === true);
endAuthLink();
check("en avslutad exchange släpper väntan", isAuthLinkInFlight() === false);

// A failed exchange must release it too — that is the `finally` above.
beginAuthLink();
endAuthLink();
check("misslyckad exchange spinner inte kvar", isAuthLinkInFlight() === false);

// Two links at once (cold start delivers the same URL to both paths) must
// not leave the counter stuck above zero.
beginAuthLink();
beginAuthLink();
endAuthLink();
check("två samtidiga länkar: fortfarande pågående efter en avslutas",
  isAuthLinkInFlight() === true);
endAuthLink();
check("båda avslutade → inget pågår", isAuthLinkInFlight() === false);

// Never negative, or the next real link would look already-finished.
endAuthLink();
endAuthLink();
check("räknaren kan inte gå under noll", isAuthLinkInFlight() === false);
beginAuthLink();
check("en ny länk efter överflödiga end-anrop registreras ändå",
  isAuthLinkInFlight() === true);
resetAuthLinkActivityForTests();

let notified = 0;
const unsubscribe = subscribeAuthLinkActivity(() => { notified += 1; });
beginAuthLink();
endAuthLink();
check("prenumeranter får besked vid varje övergång", notified === 2);
unsubscribe();
beginAuthLink();
check("avprenumeration slutar meddela", notified === 2);
resetAuthLinkActivityForTests();

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Auth reset guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Delete-account auth reset holds:");
console.log("    the callback route is no longer the navigator's fallback");
console.log("    it leaves on its own when there is nothing to sign in");
console.log("    a stale or failed exchange falls back to login, never spins");
console.log("    delete lands on login without relying on fallback semantics");
console.log("    the real confirmation path is untouched");
