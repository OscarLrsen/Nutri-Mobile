import { apiClient, requireAuth } from "./client";
import type { ApiCoupon } from "./coupons";

/**
 * Weekly reward wheel — client for the backend's RewardsController. Field
 * shapes copied verbatim from the backend DTO records (DTOs/RewardDTOs.cs) —
 * never invented:
 *
 *   RewardStatusDto(bool CanSpin, DateTime? NextSpinAt, int PointsBalance,
 *                   int ActiveRewards)
 *   SpinResultDto(Guid SpinId, string ResultType, string Title, string Icon,
 *                 string? RewardValue, CouponDto? Coupon, int? PointsAwarded,
 *                 int PointsBalance, DateTime NextSpinAt)
 *   UserRewardDto(Guid Id, string RewardType, string Title, string Icon,
 *                 string? RewardValue, string Status, DateTime CreatedAt,
 *                 DateTime? ExpiresAt, DateTime? RedeemedAt, Guid? CouponId)
 *   RewardHistoryEntryDto(Guid SpinId, DateTime SpunAt, string ResultType,
 *                         string Title, string Icon, string? RewardValue,
 *                         string? RewardStatus, DateTime? ExpiresAt)
 *
 * The BACKEND decides every outcome — POST /spin returns the already-decided
 * reward and the client wheel animation is purely visual. Coupon wins are
 * real Coupon rows: they show up in GET /api/coupons and redeem through the
 * existing checkout flow (CreateOrderDto.CouponId) — no reward-specific
 * redemption path exists, by design.
 */

export interface ApiRewardStatus {
  canSpin: boolean;
  /** ISO timestamp when the next spin unlocks; null when the user can spin
   * right now (or has never spun). */
  nextSpinAt: string | null;
  pointsBalance: number;
  /** Count of currently redeemable rewards (unused + unexpired). */
  activeRewards: number;
}

export interface ApiWheelSegment {
  id: string;
  title: string;
  icon: string;
  /** Relative draw weight — slice sizes are rendered proportional to this. */
  probabilityWeight: number;
  displayOrder: number;
}

export interface ApiSpinResult {
  spinId: string;
  /** The drawn wheel segment — the wheel lands on the matching slice.
   * Null if the segment was deleted mid-flight. */
  weeklyRewardId: string | null;
  /** "Points" | "Coupon" | "NoReward". */
  resultType: string;
  title: string;
  icon: string;
  /** Points amount ("50") or coupon percentage ("20"). */
  rewardValue: string | null;
  /** The minted coupon for Coupon wins — same shape as GET /api/coupons. */
  coupon: ApiCoupon | null;
  pointsAwarded: number | null;
  /** Balance after the spin (already credited for Points wins). */
  pointsBalance: number;
  nextSpinAt: string;
}

export interface ApiUserReward {
  id: string;
  /** "Points" | "Coupon". */
  rewardType: string;
  title: string;
  icon: string;
  rewardValue: string | null;
  /** "Unused" | "Redeemed" | "Expired" — effective status (coupon-backed
   * rewards derive it from the live Coupon row server-side). */
  status: string;
  createdAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  /** Set for Coupon rewards — open it via the existing /kupong/[id] screen. */
  couponId: string | null;
}

export interface ApiRewardHistoryEntry {
  spinId: string;
  spunAt: string;
  /** "Points" | "Coupon" | "NoReward". */
  resultType: string;
  title: string;
  icon: string;
  rewardValue: string | null;
  /** Effective status of the granted reward; null for NoReward. */
  rewardStatus: string | null;
  expiresAt: string | null;
}

/** GET /api/rewards/status — everything the header + rewards page need in
 * one request: canSpin, nextSpinAt, pointsBalance, activeRewards. */
export async function getRewardStatus(): Promise<ApiRewardStatus> {
  const { data } = await apiClient.get<ApiRewardStatus>("/api/rewards/status", requireAuth());
  return data;
}

/** GET /api/rewards/wheel — the eligible segments (title/icon/weight) so the
 * wheel renders real slices. Display data only — outcomes stay server-side. */
export async function getWheelSegments(): Promise<ApiWheelSegment[]> {
  const { data } = await apiClient.get<ApiWheelSegment[]>("/api/rewards/wheel", requireAuth());
  return data;
}

/** POST /api/rewards/spin — one spin per rolling 7 days. The backend rolls
 * the (weighted) outcome; 409 = already spun this week, 503 = wheel not
 * configured. Both surface as normalized ApiError via the client. */
export async function spinRewardWheel(): Promise<ApiSpinResult> {
  const { data } = await apiClient.post<ApiSpinResult>("/api/rewards/spin", undefined, requireAuth());
  return data;
}

/** GET /api/rewards/mine — the user's won rewards, newest first. */
export async function getMyRewards(): Promise<ApiUserReward[]> {
  const { data } = await apiClient.get<ApiUserReward[]>("/api/rewards/mine", requireAuth());
  return data;
}

/** GET /api/rewards/history — ready-to-render spin history (incl. "no
 * win"), newest first. The client never joins spins against rewards. */
export async function getRewardHistory(): Promise<ApiRewardHistoryEntry[]> {
  const { data } = await apiClient.get<ApiRewardHistoryEntry[]>("/api/rewards/history", requireAuth());
  return data;
}
