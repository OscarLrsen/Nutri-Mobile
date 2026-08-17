#!/usr/bin/env node
/**
 * Oscar-snag regression guard — pins the three fixes from the final snag
 * sweep so they cannot silently regress:
 *
 *   P20  master push toggle OFF also zeroes the subcategory flags (the
 *        backend fan-outs check only their own columns, so a stale true
 *        would keep pushing while the UI says "av"),
 *   P30a only an actual server reward list may veto/deselect a chosen
 *        stamp-card reward — a failed/offline status fetch must not,
 *   P30b the checkout card's applied preview uses the SELECTED reward's
 *        cap (same source as the summary row), never blindly list[0].
 *
 * Source pins, same style as the other guards. Run: npm run snags:check
 */

import { readFileSync } from "node:fs";

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

// ── P20: master off silences everything ─────────────────────────────────
const push = readFileSync("features/push/PushNotificationsSection.tsx", "utf8");
check("master av nollar underkategorierna i samma patch",
  /orderUpdatesEnabled:\s*false,\s*weeklyRewardsEnabled:\s*false,\s*profileRemindersEnabled:\s*false,/s.test(push));
check("master på återaktiverar INTE underkategorier",
  /\?\s*\{\s*orderUpdatesEnabled:\s*true\s*\}/s.test(push));

// ── P30a: only server truth deselects the reward ────────────────────────
const cart = readFileSync("features/cart/CartScreen.tsx", "utf8");
check("saknad reward-lista kan inte veta ned valet",
  cart.includes("availableRewardList == null ||"));
check("listan vetar fortfarande döda rewards",
  /availableRewardList\.some\(\(r\) => r\.id === activeStampCard\.rewardId\)/.test(cart));

// ── P30b: applied preview uses the selected reward's cap ────────────────
const card = readFileSync("features/cart/StampCardCheckoutCard.tsx", "utf8");
check("kortets preview räknar på den VALDA rewardens cap",
  /selectedRewardCapOre/.test(card)
  && /find\(\(r\) => r\.id === selected\.rewardId\)\?\.maxValueOre/.test(card)
  && /Math\.min\(Math\.round\(selectedItem\.meal\.basePrice \* 100\), selectedRewardCapOre\)/.test(card));

// ── Bug 5: display name may never flash the raw e-mail ──────────────────
// The PURE final-fallback chain still behaves per today's rule…
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const outDir = mkdtempSync(join(tmpdir(), "nutri-name-"));
const js = ts.transpileModule(readFileSync("utils/displayName.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = join(outDir, "displayName.mjs");
writeFileSync(mod, js);
const { deriveDisplayName } = await import(pathToFileURL(mod).href);
check("riktigt namn vinner alltid",
  deriveDisplayName({ user_metadata: { full_name: "Pontus V" }, email: "x@y.z" }, "Din profil") === "Pontus V");
check("utan namn är e-post slutgiltig fallback (dagens regel)",
  deriveDisplayName({ user_metadata: {}, email: "x@y.z" }, "Din profil") === "x@y.z");
check("utan användare gäller neutral fallback",
  deriveDisplayName(null, "Din profil") === "Din profil");

// …and the HOOK guarantees the e-mail never renders transiently.
const hook = readFileSync("services/auth/useDisplayName.ts", "utf8");
const iMeta = hook.indexOf("if (metadataName) return metadataName;");
const iCache = hook.indexOf("if (cachedName) return cachedName;");
const iWait = hook.indexOf("return fallback;", iCache);
const iEmail = hook.indexOf("return email || fallback;");
check("hookens ordning: namn → cache → neutral vänta → e-post sist",
  iMeta !== -1 && iCache !== -1 && iWait !== -1 && iEmail !== -1
  && iMeta < iCache && iCache < iWait && iWait < iEmail);
check("stale-JWT självläker via getUser()", hook.includes("supabase.auth") && hook.includes(".getUser()"));

const greeting = readFileSync("features/home/GreetingHeader.tsx", "utf8");
check("Home-hälsningen använder hooken (aldrig rå deriveDisplayName)",
  greeting.includes("useDisplayName(") && !greeting.includes("deriveDisplayName"));
const profileSrc = readFileSync("features/profile/ProfileScreen.tsx", "utf8");
check("ProfileScreen använder samma hook", profileSrc.includes("useDisplayName(t(\"profile.fallbackName\"))"));

// ── Rapport ─────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("✗ Oscar snag guard failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ Oscar snag fixes hold:");
console.log("    master push off silences weekly/profile categories too");
console.log("    only a real server reward list can deselect a stamp reward");
console.log("    checkout card previews with the selected reward's own cap");
console.log("    display name resolves name → cache → neutral — the e-mail never flashes");
