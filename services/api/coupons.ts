import { apiClient, requireAuth } from "./client";

/**
 * Coupons — client for the backend's CouponsController (PR #18, V1 scope:
 * the 20% welcome coupon). Fields copied verbatim from the backend's
 * CouponDto record (DTOs.cs) — never invented:
 *
 *   CouponDto(Guid Id, string Code, string Type, int Percentage,
 *             string Status, string Source, DateTime CreatedAt,
 *             DateTime ExpiresAt, DateTime? UsedAt, Guid? UsedOrderId)
 *
 * The discount itself is ONLY a preview on mobile (utils/discountMath.ts);
 * redemption/consumption happens exclusively server-side in
 * OrdersController.Create — the client can point at a coupon via
 * CreateOrderDto.CouponId, never set amounts.
 */

export interface ApiCoupon {
  id: string;
  code: string;
  /** V1: always "percentage" — anything else is rejected at order time. */
  type: string;
  percentage: number;
  /** "Active" | "Used" | "Expired" (backend CouponStatus.ToString()). */
  status: string;
  /** "welcome" for the V1 welcome coupon. */
  source: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedOrderId: string | null;
}

/** The backend's Coupon.Source value for the welcome coupon (CouponsController.WelcomeSource). */
export const WELCOME_COUPON_SOURCE = "welcome";

/** True when the coupon can still be attached to an order. The backend
 * re-validates authoritatively (status AND ExpiresAt) at order time; the
 * expiry re-check here only keeps a stale "Active" row (list fetched before
 * midnight, say) from being offered in the UI. */
export function isCouponUsable(coupon: ApiCoupon): boolean {
  return coupon.status === "Active" && new Date(coupon.expiresAt).getTime() > Date.now();
}

/** GET /api/coupons — the authenticated user's own coupons, newest first.
 * The backend flips Active→Expired on read, so statuses are truthful. */
export async function getMyCoupons(): Promise<ApiCoupon[]> {
  const { data } = await apiClient.get<ApiCoupon[]>("/api/coupons", requireAuth());
  return data;
}

/** POST /api/coupons/welcome/claim — mints (or, idempotently, returns the
 * already-claimed) welcome coupon for the authenticated user. Requires a
 * JWT with both sub and email claims. */
export async function claimWelcomeCoupon(): Promise<ApiCoupon> {
  const { data } = await apiClient.post<ApiCoupon>(
    "/api/coupons/welcome/claim",
    undefined,
    requireAuth()
  );
  return data;
}
