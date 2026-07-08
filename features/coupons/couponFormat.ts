import type { ApiCoupon } from "@/services/api/coupons";
import { couponCopy as copy } from "@/constants/copy";

/** Feature-local formatting shared by the coupon list and detail screens. */

export function formatCouponDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

/** One status-appropriate meta line: validity, used-at or expired-at. */
export function couponMetaLine(coupon: ApiCoupon): string {
  if (coupon.status === "Used" && coupon.usedAt) return copy.usedAt(formatCouponDate(coupon.usedAt));
  if (coupon.status === "Expired") return copy.expiredAt(formatCouponDate(coupon.expiresAt));
  return copy.validUntil(formatCouponDate(coupon.expiresAt));
}

export const COUPON_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  Active: { color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
  Used: { color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.06)" },
  Expired: { color: "#f87171", bg: "rgba(248,113,113,0.1)" },
};
