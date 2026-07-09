import type { ApiUserReward } from "@/services/api/rewards";
import { rewardsCopy as copy } from "@/constants/copy";

/** Feature-local formatting shared by the rewards screen sections —
 * mirrors features/coupons/couponFormat.ts. */

export function formatRewardDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

/** One status-appropriate meta line: validity, redeemed-at or expired-at. */
export function rewardMetaLine(reward: ApiUserReward): string {
  if (reward.status === "Redeemed" && reward.redeemedAt)
    return copy.redeemedAt(formatRewardDate(reward.redeemedAt));
  if (reward.status === "Expired" && reward.expiresAt)
    return copy.expiredAt(formatRewardDate(reward.expiresAt));
  if (reward.expiresAt) return copy.validUntil(formatRewardDate(reward.expiresAt));
  return copy.wonAt(formatRewardDate(reward.createdAt));
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
