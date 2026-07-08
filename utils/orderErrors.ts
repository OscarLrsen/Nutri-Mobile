import type { ApiError } from "@/types/api";
import { checkoutCopy } from "@/constants/copy";

/**
 * Order-placement error classification, ported from the local helpers in the
 * web's varukorg/page.tsx (formatOrderError / isActiveReservationErr /
 * isStockOutError). The web parses `API <status>: <body>` strings thrown by
 * apiFetch; on mobile the axios interceptor has already normalized errors to
 * ApiError {status, message, details}, so the same status+text rules are
 * applied to those fields instead — the classification outcomes are
 * identical per backend response.
 */

function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as ApiError).status === "number" &&
    "message" in err
  );
}

/** Full searchable text of the error — extracted message plus the raw body,
 * mirroring how the web regex-tests the whole `API <status>: <body>` string. */
function errorText(err: ApiError): string {
  const details =
    typeof err.details === "string" ? err.details : err.details ? JSON.stringify(err.details) : "";
  return `${err.message} ${details}`;
}

export interface OrderErrorResult {
  /** Human-readable message to render, or null when handled elsewhere (401 → login redirect). */
  message: string | null;
  /** True for 401 — caller should redirect to login instead of showing text. */
  unauthorized: boolean;
}

export function formatOrderError(err: unknown): OrderErrorResult {
  if (!isApiError(err)) {
    // Includes the pre-network "Not authenticated" throw from the auth
    // interceptor / createOrder fast-fail — treat as unauthorized so the
    // caller sends the user to login (web parity: withAuth throws, page
    // redirects on 401-equivalent).
    if (err instanceof Error && /not authenticated/i.test(err.message)) {
      return { message: null, unauthorized: true };
    }
    return { message: checkoutCopy.errorGeneric, unauthorized: false };
  }
  if (err.status === 401) {
    return { message: null, unauthorized: true };
  }
  const text = errorText(err);
  if (err.status === 409 && /service is not live/i.test(text)) {
    return { message: checkoutCopy.errorJustClosed, unauthorized: false };
  }
  if (err.status === 409 && /slut i lager:/i.test(text)) {
    // Web: pull the meal name out of "Slut i lager: <name> storlek <s>" /
    // "Slut i lager: <name> (…)".
    const nameMatch = text.match(/slut i lager:\s*(.+?)(?:\s+storlek\s+|\s+\()/i);
    if (nameMatch) {
      return { message: checkoutCopy.errorOutOfStockNamed(nameMatch[1]), unauthorized: false };
    }
    return { message: checkoutCopy.errorOutOfStockGeneric, unauthorized: false };
  }
  if (err.status === 0) {
    // Network-level failure — the interceptor's own Swedish message.
    return { message: err.message, unauthorized: false };
  }
  return { message: err.message || checkoutCopy.errorGeneric, unauthorized: false };
}

/** The ONLY messages OrdersController.Create sends when it explicitly
 * refuses the coupon itself (validation + the concurrency-race 409). The
 * coupon may be deselected on exactly these — never on network failures
 * (status 0 can't match the status gate), "Service is not live", stock-outs
 * or any other order error, where the coupon was left untouched server-side
 * and must stay selected. */
const COUPON_REJECTION_MESSAGES = [
  /ogiltig kupong/i,
  /kupongen är redan använd/i,
  /kupongen har gått ut/i,
];

/** Backend coupon rejection at order time — 400 "Ogiltig kupong." or 409
 * "Kupongen är redan använd." / "Kupongen har gått ut.". Matches the exact
 * backend messages (not a loose keyword) so no other current or future
 * 400/409 can be misread as a coupon rejection. */
export function isCouponRejectedError(err: unknown): boolean {
  if (!isApiError(err)) return false;
  if (err.status !== 400 && err.status !== 409) return false;
  const text = errorText(err);
  return COUPON_REJECTION_MESSAGES.some((re) => re.test(text));
}

/** Backend 409 "du har redan en aktiv reservation" guard (web parity). */
export function isActiveReservationErr(err: unknown): boolean {
  if (!isApiError(err)) return false;
  return err.status === 409 && /aktiv reservation/i.test(errorText(err));
}

/** Backend 409 stock errors — legacy "Slut i lager:…" and the JSON shape
 * `{ error: "Insufficient stock", … }` (web parity). */
export function isStockOutError(err: unknown): boolean {
  if (!isApiError(err)) return false;
  if (err.status !== 409) return false;
  const text = errorText(err);
  return /slut i lager/i.test(text) || /insufficient stock/i.test(text);
}
