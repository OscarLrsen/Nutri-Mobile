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
