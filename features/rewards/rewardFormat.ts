import type { TFunction } from "i18next";

import type { ApiUserReward } from "@/services/api/rewards";
import { formatDate, type AppLanguage } from "@/i18n";

/** Feature-local formatting shared by the rewards screen sections —
 * mirrors features/coupons/couponFormat.ts. */

export function formatRewardDate(iso: string, language: AppLanguage): string {
  return formatDate(new Date(iso), language, { day: "numeric", month: "long" });
}

/** One status-appropriate meta line: validity, redeemed-at or expired-at. The
 * caller passes its own `t`/`language` so the line follows the active language. */
export function rewardMetaLine(
  reward: ApiUserReward,
  t: TFunction,
  language: AppLanguage,
): string {
  if (reward.status === "Redeemed" && reward.redeemedAt)
    return t("rewards.redeemedAt", { date: formatRewardDate(reward.redeemedAt, language) });
  if (reward.status === "Expired" && reward.expiresAt)
    return t("rewards.expiredAt", { date: formatRewardDate(reward.expiresAt, language) });
  if (reward.expiresAt)
    return t("rewards.validUntil", { date: formatRewardDate(reward.expiresAt, language) });
  return t("rewards.wonAt", { date: formatRewardDate(reward.createdAt, language) });
}

/** Same palette as COUPON_STATUS_COLORS, keyed by UserRewardStatus. */
export const REWARD_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  Unused: { color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
  Redeemed: { color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.06)" },
  Expired: { color: "#f87171", bg: "rgba(248,113,113,0.1)" },
};

/** Live countdown parts to a future ISO timestamp (clamped at zero). */
export function countdownParts(untilIso: string): { d: number; h: number; m: number } {
  const ms = Math.max(0, new Date(untilIso).getTime() - Date.now());
  const totalMinutes = Math.floor(ms / 60_000);
  return {
    d: Math.floor(totalMinutes / (60 * 24)),
    h: Math.floor((totalMinutes % (60 * 24)) / 60),
    m: totalMinutes % 60,
  };
}
