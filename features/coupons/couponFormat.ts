import type { TFunction } from "i18next";

import { formatDate } from "@/i18n/formatters";
import type { AppLanguage } from "@/i18n/languages";
import type { ApiCoupon } from "@/services/api/coupons";

/** Feature-local formatting shared by the coupon list and detail screens. */

export function formatCouponDate(iso: string, language: AppLanguage): string {
  return formatDate(new Date(iso), language);
}

/** One status-appropriate meta line: validity, used-at or expired-at. The
 * caller passes its own `t`/`language` so the line follows the active
 * language. */
export function couponMetaLine(coupon: ApiCoupon, t: TFunction, language: AppLanguage): string {
  if (coupon.status === "Used" && coupon.usedAt)
    return t("coupon.usedAt", { date: formatCouponDate(coupon.usedAt, language) });
  if (coupon.status === "Expired")
    return t("coupon.expiredAt", { date: formatCouponDate(coupon.expiresAt, language) });
  return t("coupon.validUntil", { date: formatCouponDate(coupon.expiresAt, language) });
}

export const COUPON_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  Active: { color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
  Used: { color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.06)" },
  Expired: { color: "#f87171", bg: "rgba(248,113,113,0.1)" },
};
