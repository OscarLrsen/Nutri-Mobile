import { apiClient, requireAuth } from "./client";
import { supabase } from "@/services/auth/supabase";

/**
 * Orders — ported from Nutri-Frontend's src/lib/api.ts `ordersApi` (spec
 * §14.2). Types copied field-for-field from the web's ApiOrder/ApiOrderLine.
 *
 * Payment-state rules (CLAUDE.md / spec §18): the backend ignores any
 * client-supplied paymentStatus/paymentReference and marks new orders
 * PendingPayment/Unpaid itself. Stripe orders are confirmed Paid ONLY by the
 * verified webhook — the mobile app must never mark an order paid.
 */

export interface ApiOrder {
  id: string;
  orderNumber: number;
  businessDate: string;
  lines: ApiOrderLine[];
  subtotalOre: number;
  totalOre: number;
  paymentStatus: string;
  paymentReference?: string;
  paymentMethod?: string;
  status: string;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  isVIP: boolean;
  customerStatus: string | null;
  /** ISO UTC string — only present for pay_on_site orders awaiting payment. */
  reservedUntil?: string | null;
  source?: "Online" | "POS" | string;
  discountPercent?: number;
  discountAmountOre?: number;
  /** Order-level free-text comment from the customer to the kitchen. Null when empty. */
  customerNote?: string | null;
}

export interface ApiOrderLine {
  id: string;
  lineType: string;
  mealId?: string;
  titleSnapshot: string;
  categorySnapshot: string;
  size: string;
  quantity: number;
  unitPriceOre: number;
  lineTotalOre: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  macros?: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };
  modifiers?: { swappedFrom: string; swappedTo: string }[];
  ingredients?: { name: string; amountG: number; allergens: string[] }[];
  notes?: string | null;
}

/** Response from POST /api/orders/{id}/create-checkout-session. */
export interface CreateCheckoutSessionResponse {
  sessionId: string;
  url: string;
}

/** Input shape of the web ordersApi.create() — the cart maps CartItems into
 * this, and this module maps it onto the backend's `lines` body. */
export interface CreateOrderInput {
  customerName: string;
  customerEmail: string;
  paymentMethod?: "pay_on_site" | "stripe";
  /** Optional free-text comment to the kitchen. Server trims and caps at 500 chars. */
  customerNote?: string;
  /** Optional coupon to apply (CreateOrderDto.CouponId). The server validates
   * ownership/status/expiry and computes the discount itself — the client
   * only ever points at a coupon, never sends amounts. Requires a JWT with a
   * sub claim; the backend 401s a couponId from an email-only session. */
  couponId?: string;
  items: {
    mealId: string | null;
    size: string;
    quantity: number;
    isTailored?: boolean;
    customMacros?: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };
    customIngredients?: { ingredientId: string; name: string; amountG: number }[];
    containerTypeId?: string;
    originalMealName?: string;
  }[];
}

/**
 * POST /api/orders — verbatim port of the web ordersApi.create():
 * - attaches supabaseUserId + Bearer token when a session exists (token is
 *   optional at the transport level; the backend requires it for tailored
 *   lines, and the cart UI gates ordering behind login anyway)
 * - throws "Not authenticated" before the network call if a tailored line
 *   has no session (web fast-fail parity)
 * - maps `items` → backend `lines`: customMacros is NOT sent; custom
 *   ingredients are reduced to {ingredientId, amountG}; paymentMethod
 *   defaults to "pay_on_site".
 */
export async function createOrder(order: CreateOrderInput): Promise<ApiOrder> {
  const { items, ...rest } = order;
  const hasTailored = items.some((i) => i.isTailored);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const supabaseUserId = session?.user.id;

  if (hasTailored && !session) {
    throw new Error("Not authenticated");
  }

  const { data } = await apiClient.post<ApiOrder>(
    "/api/orders",
    {
      ...rest,
      supabaseUserId: supabaseUserId ?? null,
      paymentMethod: rest.paymentMethod ?? "pay_on_site",
      couponId: rest.couponId ?? null,
      lines: items.map(
        ({ isTailored, customMacros: _unused, customIngredients, containerTypeId, ...line }) => ({
          ...line,
          isTailored: isTailored ?? false,
          containerTypeId: containerTypeId ?? null,
          ingredients:
            customIngredients?.map((ing) => ({
              ingredientId: ing.ingredientId,
              amountG: ing.amountG,
            })) ?? null,
        })
      ),
    },
    session ? { headers: { Authorization: `Bearer ${session.access_token}` } } : undefined
  );
  return data;
}

/**
 * POST /api/orders/{id}/create-checkout-session — creates (or reuses) a
 * Stripe Checkout Session and returns its redirect URL. Authenticated, no
 * body. Payment is confirmed only by the Stripe webhook; the URL is purely
 * a redirect target (opened in the system browser on mobile).
 */
export async function createCheckoutSession(id: string): Promise<CreateCheckoutSessionResponse> {
  const { data } = await apiClient.post<CreateCheckoutSessionResponse>(
    `/api/orders/${id}/create-checkout-session`,
    undefined,
    requireAuth()
  );
  return data;
}

/** GET /api/orders/{id} — authenticated single-order read (web ordersApi.getById). */
export async function getOrderById(id: string): Promise<ApiOrder> {
  const { data } = await apiClient.get<ApiOrder>(`/api/orders/${id}`, requireAuth());
  return data;
}

/** GET /api/orders/by-email/{email} — authenticated order history
 * (web ordersApi.getByEmail; used by the profile's Orderhistorik). */
export async function getOrdersByEmail(email: string): Promise<ApiOrder[]> {
  const { data } = await apiClient.get<ApiOrder[]>(
    `/api/orders/by-email/${encodeURIComponent(email)}`,
    requireAuth()
  );
  return data;
}
