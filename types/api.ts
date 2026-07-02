/**
 * Shared, feature-agnostic API types ported from the backend contract
 * documented in NUTRI_MOBILE_TECHNICAL_SPECIFICATION_V1.md §2/§3/§19.
 *
 * INTENTIONALLY NOT INCLUDED YET (belongs to a future feature phase, not
 * this infrastructure phase — see the "no business logic" scope in this
 * phase's instructions): ApiMeal, ApiOrder, ApiDrink, CartItem, and other
 * feature-specific DTOs. Only the foundational, cross-cutting types that the
 * API/error-handling infrastructure itself needs are defined here. Do not
 * invent additional DTO fields beyond what the spec documents — if a future
 * feature needs a DTO not yet ported here, copy it from the spec exactly,
 * never guess a shape.
 */

/** Money is always öre (1/100 SEK) on the wire, exactly as the backend and
 * Nutri-Frontend's api.ts represent it. Convert to kronor only at render
 * time — see utils/money.ts. */
export type Ore = number;

/** Backend Models/Order.cs OrderStatus enum — stored/serialized as a string,
 * never an ordinal number. Spec §3.5/§19. */
export type OrderStatus =
  | "Pending"
  | "Confirmed"
  | "Preparing"
  | "Ready"
  | "Delivered"
  | "Cancelled"
  | "PendingPayment"
  | "Expired";

/** Backend Models/Order.cs PaymentStatus enum. Spec §3.5. */
export type PaymentStatus = "Unpaid" | "Paid" | "Refunded";

/** Order.PaymentMethod string field. Only "pay_on_site" and "stripe" are
 * live today — "swish"/"card"/"apple_pay" are reserved-but-unimplemented
 * values per spec §18.4/§19; do not offer them as user-selectable options
 * in any future checkout UI. */
export type PaymentMethod = "pay_on_site" | "stripe";

/** Normalized shape every thrown API error is coerced into by the axios
 * client (services/api/client.ts), regardless of whether it originated as
 * an HTTP error response, a network failure, or a Zod validation failure. */
export interface ApiError {
  /** HTTP status code, or 0 for network-level failures (no response received). */
  status: number;
  /** Human-readable message, safe to show in a toast/banner. */
  message: string;
  /** Raw response body, if any, for logging/debugging — never render this
   * directly in the UI. */
  details?: unknown;
}
