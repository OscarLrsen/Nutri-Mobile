import { apiClient, requireAuth } from "./client";

/**
 * Food feedback on delivered orders — the "hur smakade maten?" flow.
 *
 * THE SERVER OWNS ELIGIBILITY. `getOrderReviewPrompt` returns the one order
 * worth asking about (delivered, recent, unreviewed, and never while another
 * order is in flight) or null. The app adds only presentation-side timing:
 * not immediately after payment, once per app session.
 */

export interface ApiOrderReviewPrompt {
  orderId: string;
  orderNumber: number;
  deliveredAt: string;
  firstMealTitle: string | null;
  mealCount: number;
}

export interface ApiOrderReview {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  isAnonymous: boolean;
  allowMarketingUse: boolean;
  skipped: boolean;
  createdAt: string;
}

export interface SubmitOrderReviewInput {
  orderId: string;
  rating: number;
  comment?: string;
  isAnonymous: boolean;
  /** Separate, active opt-in. NEVER defaulted to true anywhere. */
  allowMarketingUse: boolean;
}

export async function getOrderReviewPrompt(): Promise<ApiOrderReviewPrompt | null> {
  const res = await apiClient.get<{ prompt: ApiOrderReviewPrompt | null }>(
    "/api/order-reviews/prompt",
    requireAuth(),
  );
  return res.data.prompt ?? null;
}

export async function submitOrderReview(
  input: SubmitOrderReviewInput,
): Promise<ApiOrderReview> {
  const res = await apiClient.post<ApiOrderReview>(
    "/api/order-reviews",
    input,
    requireAuth(),
  );
  return res.data;
}

/** "Inte nu" — remembered server-side so the same order never asks again. */
export async function skipOrderReview(orderId: string): Promise<ApiOrderReview> {
  const res = await apiClient.post<ApiOrderReview>(
    `/api/order-reviews/${orderId}/skip`,
    undefined,
    requireAuth(),
  );
  return res.data;
}
