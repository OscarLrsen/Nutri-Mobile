#!/usr/bin/env node
/**
 * Regression guard: THE APP ACTUALLY ASKS FOR PUSH PERMISSION.
 *
 * ── THE BUG ──────────────────────────────────────────────────────────
 *
 * iOS never showed "Vill du tillåta att Nutri skickar notiser?" in
 * TestFlight, so no token existed and no push could arrive. Nothing was
 * broken about permissions — the app never called
 * requestPermissionsAsync().
 *
 * The one automatic path to the system prompt was PushPrePromptCard, which
 * renders on the ORDER STATUS screen and only for an order just placed from
 * that installation. Sign up, log in, use the app without ordering, and you
 * were never asked. PushTokenSync ran on every login but was explicitly "a
 * silent no-op unless permission is ALREADY granted", so it could not ask
 * either. Between them, nothing did.
 *
 * This pins the flow that fixes it, and — just as importantly — pins the
 * one-prompt rule, because the cheap way to "fix" this is to ask on every
 * render and burn the customer's single iOS prompt.
 *
 * Run: npm run push:check
 */

import { readFileSync } from "node:fs";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };
const codeOf = (p) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SYNC = "features/push/PushTokenSync.tsx";
const CORE = "services/push/pushNotifications.ts";
const PREPROMPT = "features/push/PushPrePromptCard.tsx";
const SECTION = "features/push/PushNotificationsSection.tsx";
const LAYOUT = "app/_layout.tsx";

const sync = codeOf(SYNC);
const core = codeOf(CORE);
const layout = readFileSync(LAYOUT, "utf8");

// ── A: an authenticated user with "undetermined" IS asked ───────────────
check("PushTokenSync kan faktiskt begära permission",
  sync.includes("requestPushPermission"));
check("den frågar bara när OS aldrig har frågats",
  sync.includes('if (status !== "undetermined"'));
check("den frågar bara för en inloggad användare",
  sync.includes("if (!userId) return;") && sync.includes("useAuth()"));
check("flödet körs vid appstart OCH vid login (keyat på user id)",
  /useEffect\([\s\S]*?\}, \[userId\]\);/.test(sync));
check("komponenten är monterad globalt",
  layout.includes("<PushTokenSync />"));

// ── B: granted → token → backend registration ───────────────────────────
check("registrering försöks före allt annat (idempotent retry)",
  sync.includes("if (await registerCurrentDeviceForPush()) return;"));
check("beviljad permission registrerar direkt, inte vid nästa start",
  /if \(result === "granted"\) await registerCurrentDeviceForPush\(\);/.test(sync));
check("registrering hämtar Expo-token med rätt projectId",
  core.includes("Notifications.getExpoPushTokenAsync({ projectId })")
  && core.includes("Constants.expoConfig?.extra?.eas?.projectId"));
check("token POST:as till backend", core.includes("await registerPushDevice({"));
check("registrering kräver beviljad permission",
  core.includes('if (permission !== "granted") return false;'));

// ── C: ONE prompt, ever — no loop, no second dialog ─────────────────────
check("en lagrad flagga skyddar mot en andra systemprompt",
  sync.includes("PUSH_ASKED_KEY")
  && /getItem\(PUSH_ASKED_KEY\)\)\s*===\s*"1"[^)]*\)\s*return;/.test(sync));
check("flaggan sätts INNAN dialogen visas",
  sync.indexOf("setItem(PUSH_ASKED_KEY") < sync.indexOf("await requestPushPermission()"));
check("prompten ligger i en effekt, inte i render",
  !/^\s*(const|let)?\s*requestPushPermission\(\);/m.test(sync)
  && sync.includes("useEffect("));
check("effekten städas upp så ett avmonterat träd inte frågar",
  sync.includes("cancelled = true") && (sync.match(/if \(cancelled\)/g) ?? []).length >= 3);

// ── D: denied must not crash or loop ────────────────────────────────────
check("nekad permission stoppar flödet utan att kasta",
  sync.includes("} catch {"));
check("permission-läsningen kastar aldrig",
  core.includes("} catch {\n    return \"unavailable\";\n  }")
  || /getPushPermissionStatus[\s\S]{0,400}catch \{[\s\S]{0,80}return "unavailable"/.test(core));
check("registrering kastar aldrig ut i anropande flöde",
  /export async function registerCurrentDeviceForPush[\s\S]*?try \{/.test(core)
  && /catch \{[\s\S]{0,200}return false;/.test(core));
check("simulator/web ger inget försök alls",
  core.includes("if (!Device.isDevice) return") );
check("Expo Go bailar ut explicit (remote push finns inte där)",
  core.includes('Constants.appOwnership === "expo"'));

// ── E: the manual paths still exist ─────────────────────────────────────
check("profilens Notiser-sektion finns kvar som återställningsväg",
  readFileSync(SECTION, "utf8").includes("requestPushPermission")
  && readFileSync("features/profile/ProfileScreen.tsx", "utf8").includes("<PushNotificationsSection />"));
check("order-pre-prompten finns kvar och självstänger när OS redan svarat",
  readFileSync(PREPROMPT, "utf8").includes('(await getPushPermissionStatus()) !== "undetermined"'));

// ── F: logout / delete lifecycle ────────────────────────────────────────
const auth = readFileSync("services/auth/AuthProvider.tsx", "utf8");
check("utloggning avaktiverar enhetens token innan sessionen dör",
  auth.includes("await deactivateCurrentDevicePush();"));
check("kontoradering går genom samma signOut",
  readFileSync("features/profile/DeleteAccountSection.tsx", "utf8").includes("await signOut();"));

// ── G: iOS build config must be able to receive push at all ─────────────
const app = JSON.parse(readFileSync("app.json", "utf8")).expo;
const plugin = (app.plugins ?? []).find(
  (p) => (Array.isArray(p) ? p[0] : p) === "expo-notifications"
);
check("expo-notifications-pluginet finns (genererar iOS push-capability)", plugin != null);
check("EAS projectId är projektets", app.extra?.eas?.projectId === "3208b54f-4d3b-44c2-8686-e4db275cf29e");
check("bundle id är production", app.ios?.bundleIdentifier === "com.nutrifoodtruck.app");
check("push-kanalen är default, inte staging",
  (Array.isArray(plugin) ? plugin[1]?.defaultChannel : null) === "default");

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Push permission guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Push permission flow holds:");
console.log("    a signed-in user with an unanswered OS prompt IS asked, at app start and at login");
console.log("    granted -> Expo token with the project id -> backend registration, immediately");
console.log("    exactly one system prompt: undetermined check + stored flag, inside an effect");
console.log("    denied, simulator and Expo Go all bail out without throwing or looping");
console.log("    the profile section and the order pre-prompt remain as manual paths");
