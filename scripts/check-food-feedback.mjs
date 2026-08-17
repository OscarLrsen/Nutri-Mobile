#!/usr/bin/env node
/**
 * Food-feedback guard: the "Hur smakade maten?" sheet must never freeze the
 * app on close, and its content must fit one phone screen.
 *
 * WHY THIS EXISTS. Closing the sheet used to unmount a VISIBLE transparent
 * RN Modal (no `visible` prop — dismissal happened by rendering null the
 * instant the session store flipped). Tearing down a presented Modal
 * mid-animation leaves its native window eating every touch: the app looks
 * frozen after "Inte nu"/submit. The fix is a two-phase close — visible=false
 * first, session flip only after native dismissal (onDismiss + timer
 * fallback). This guard functionally tests the session store (transpiled
 * REAL source, RN/React stubbed) and pins the modal lifecycle + compact
 * layout in the component source.
 *
 * Run: npm run feedback:check
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

// ── Session store: transpile the REAL source with RN/React stubbed ──────
const outDir = mkdtempSync(join(tmpdir(), "nutri-feedback-"));
writeFileSync(join(outDir, "rn-stub.mjs"),
  'export const AppState = { currentState: "active", addEventListener: () => ({ remove() {} }) };\n');
writeFileSync(join(outDir, "react-stub.mjs"),
  "export const useSyncExternalStore = (subscribe, get) => { globalThis.__nutriLastSubscribe = subscribe; return get(); };\n");

let js = ts.transpileModule(readFileSync("features/feedback/feedbackSession.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
js = js
  .replace(/from\s+"react-native"/g, 'from "./rn-stub.mjs"')
  .replace(/from\s+"react"/g, 'from "./react-stub.mjs"');
const mod = join(outDir, "feedbackSession.mjs");
writeFileSync(mod, js);
const { dismissFeedbackForSession, resetFeedbackSession, useFeedbackSession } =
  await import(pathToFileURL(mod).href);

// 1. Fresh session: not dismissed, has a start time.
const s1 = useFeedbackSession();
check("ny session är inte dismissad", s1.dismissed === false && Number.isFinite(s1.startedAt));

// 2. Dismiss flips state and notifies exactly once — a second dismiss is a
//    no-op (double-tap on "Inte nu" must not re-emit).
let notifications = 0;
const unsubscribe = globalThis.__nutriLastSubscribe(() => { notifications++; });
dismissFeedbackForSession();
check("dismiss sätter dismissed", useFeedbackSession().dismissed === true);
check("dismiss notifierar exakt en gång", notifications === 1);
dismissFeedbackForSession();
check("dubbel-dismiss är no-op", notifications === 1 && useFeedbackSession().dismissed === true);

// 3. Reset (logout hook) clears the dismissal for the next account.
resetFeedbackSession();
check("reset öppnar för nästa session", useFeedbackSession().dismissed === false && notifications === 2);
unsubscribe();

// ── Modal lifecycle pins in the component source ────────────────────────
const src = readFileSync("features/feedback/FoodFeedbackPrompt.tsx", "utf8");

check("Modal drivs av visible-prop (aldrig bar unmount)", /<Modal\s[^>]*visible=\{!closing\}/s.test(src));
check("onDismiss fullföljer stängningen (iOS)", src.includes("onDismiss={completeClose}"));
check("timer-fallback finns (Android saknar onDismiss)", src.includes("setTimeout(completeClose"));
check("dubbeltryck stänger en gång", src.includes("if (closing) return"));
check("sessionen flippas FÖRST i completeClose", (() => {
  const begin = src.indexOf("const beginClose");
  const complete = src.slice(src.indexOf("const completeClose"), begin);
  return complete.includes("dismissFeedbackForSession()")
    && !src.slice(begin, src.indexOf("const submitMutation")).includes("dismissFeedbackForSession()");
})());
check("submit-fel återställer utan att stänga",
  /onError:\s*\(\)\s*=>\s*\{\s*sendingRef\.current = false;\s*setError\(true\);/s.test(src));
check("submit blockeras under stängning", src.includes("sendingRef.current || closing"));

// ── Compact layout pins ─────────────────────────────────────────────────
check("stjärnor är kompakta (28, inte 34)", src.includes("size={28}") && !src.includes("size={34}"));
check("kommentarsfältet är 60pt", /minHeight:\s*60/.test(src));
check("sheeten har inte den gamla jättepaddingen", !src.includes("paddingBottom: spacing[8]"));
check("stjärnraden har kompakt marginal", /starsRow:[\s\S]*?marginVertical:\s*spacing\[3\]/.test(src));

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Food feedback guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Food feedback sheet holds:");
console.log("    two-phase close — session flips only after native modal dismissal");
console.log("    double-taps, submit errors and unmount races cannot freeze the app");
console.log("    compact layout: all content + both CTAs fit one phone screen");
