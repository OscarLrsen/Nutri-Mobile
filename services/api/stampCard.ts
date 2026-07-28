import { apiClient, requireAuth } from "./client";

/**
 * Stamp card — client for the backend's StampCardController (patch 16A,
 * backend commit e13687a). Field shapes copied verbatim from the backend DTO
 * records (DTOs/StampCardDTOs.cs), never invented:
 *
 *   StampCardStatusDto(int CurrentStamps, int TotalNetStamps,
 *                      int StampsRequired, int StampsRemaining,
 *                      int AvailableRewards, int NextRewardAt,
 *                      int MaxValueOre, DateTime? LastActivityAt)
 *   StampCardHistoryEntryDto(Guid Id, string EntryType, int Quantity,
 *                            DateTime CreatedAt, Guid OrderId,
 *                            int? OrderNumber, string PublicReason)
 *   StampCardHistoryRewardDto(Guid Id, int RewardOrdinal, string Status,
 *                             DateTime EarnedAt, int MaxValueOre)
 *   StampCardHistoryDto(entries, rewards)
 *
 * THE BACKEND OWNS EVERY NUMBER. Progress is never derived from order
 * history here — a filtered or paginated order list would silently produce a
 * wrong card. The client only renders what these endpoints return.
 *
 * The admin DTO's internal fields (Reason, CreatedByAdminEmail,
 * IdempotencyKey, SupabaseUserId) are absent from the customer contract, so
 * there is nothing for this client to accidentally surface.
 */

/** Entry types the ledger can hold. Patch 16A only writes "Earned"; the
 * other two arrive with reversals and admin corrections, and the UI already
 * renders them so that patch needs no app update. */
export type StampCardEntryType = "Earned" | "Reversed" | "AdminAdjustment";

/** Reward lifecycle. 16A only creates "Available"; redemption lands in 16C. */
export type StampCardRewardStatus = "Available" | "Reserved" | "Redeemed" | "Revoked";

export interface ApiStampCardStatus {
  /** Stamps on the CURRENT card, 0–9. A completed card reads 0 with the
   * reward moved into availableRewards — the backend has already started the
   * next card, so the UI must NOT draw ten filled stamps. */
  currentStamps: number;
  /** Lifetime net total (earned minus reversals). */
  totalNetStamps: number;
  stampsRequired: number;
  stampsRemaining: number;
  availableRewards: number;
  /** Lifetime net total at which the next reward is earned. */
  nextRewardAt: number;
  /** Admin-controlled cap in öre. Display only — never hardcode it. */
  maxValueOre: number;
  lastActivityAt: string | null;
}

export interface ApiStampCardHistoryEntry {
  id: string;
  entryType: StampCardEntryType;
  /** Signed: positive for earned, negative for a reversal. */
  quantity: number;
  createdAt: string;
  orderId: string;
  /** Null when the source order is no longer readable. */
  orderNumber: number | null;
  /** Stable machine code — "meal_picked_up" | "order_reversed" |
   * "admin_adjustment". Never free text, never an admin identity. */
  publicReason: string;
}

export interface ApiStampCardHistoryReward {
  id: string;
  /** 1-based: reward 1 covers stamps 1–10. */
  rewardOrdinal: number;
  status: StampCardRewardStatus;
  earnedAt: string;
  maxValueOre: number;
}

export interface ApiStampCardHistory {
  entries: ApiStampCardHistoryEntry[];
  rewards: ApiStampCardHistoryReward[];
}

/** GET /api/stamp-card — progress for the signed-in customer. */
export async function getStampCardStatus(): Promise<ApiStampCardStatus> {
  const { data } = await apiClient.get<ApiStampCardStatus>("/api/stamp-card", requireAuth());
  return data;
}

/** GET /api/stamp-card/history — the customer's own ledger and rewards. */
export async function getStampCardHistory(limit = 20): Promise<ApiStampCardHistory> {
  const { data } = await apiClient.get<ApiStampCardHistory>(
    `/api/stamp-card/history?limit=${limit}`,
    requireAuth()
  );
  return data;
}
