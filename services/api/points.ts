import { apiClient, requireAuth } from "./client";

/**
 * Nutri points ledger — client for the backend's PointsController. Shape
 * copied verbatim from PointsTransactionDto (DTOs/RewardDTOs.cs). The
 * current balance is NOT fetched here — it already rides along on
 * GET /api/rewards/status (RewardStatusDto.pointsBalance); one source,
 * no duplicate endpoint.
 */

export interface ApiPointsTransaction {
  id: string;
  /** Positive = earned. (No spend reasons exist yet — future feature.) */
  amount: number;
  /** Enum name: "OrderEarned" | "WeeklyRewardEarned" | future reasons. */
  reason: string;
  createdAt: string;
  orderId: string | null;
  rewardSpinId: string | null;
}

/** GET /api/points/transactions — the authenticated user's own ledger,
 * newest first (latest 100). */
export async function getMyPointsTransactions(): Promise<ApiPointsTransaction[]> {
  const { data } = await apiClient.get<ApiPointsTransaction[]>(
    "/api/points/transactions",
    requireAuth()
  );
  return data;
}
