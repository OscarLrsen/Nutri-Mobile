/**
 * Order-status vocabulary shared by the status screen and the active-order
 * banner. Verbatim web ports (see OrderStatusScreen's header) — extracted so
 * the banner cannot drift from the screen it opens.
 */

export type CustomerStatus =
  | "awaiting_payment"
  | "created"
  | "inprogress"
  | "ready"
  | "completed"
  | "cancelled"
  | "expired"
  | "terminal";

export function toCustomerStatus(s: string): CustomerStatus {
  switch (s.toLowerCase()) {
    case "pendingpayment":
      return "awaiting_payment";
    case "pending":
      return "created";
    case "confirmed":
    case "preparing":
      return "inprogress";
    case "ready":
      return "ready";
    case "delivered":
      return "completed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "terminal";
  }
}

export const KITCHEN_STATUSES = ["created", "inprogress", "ready"] as const;

export function stepIndex(s: CustomerStatus) {
  return KITCHEN_STATUSES.indexOf(s as (typeof KITCHEN_STATUSES)[number]);
}

export function isTerminal(cs: CustomerStatus) {
  return cs === "terminal" || cs === "expired" || cs === "completed" || cs === "cancelled";
}

/** Rough customer-facing wait estimate per state (verbatim web values). */
export function estimateWaitMinutes(cs: CustomerStatus): number | null {
  switch (cs) {
    case "created":
      return 12;
    case "inprogress":
      return 5;
    case "ready":
      return null;
    default:
      return null;
  }
}
