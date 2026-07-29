import type { TFunction } from "i18next";
import type { ApiError } from "@/types/api";

/**
 * Included-drink failures from POST /api/orders (patch 17B).
 *
 * Mapped by CODE, never by message text: the backend answers in Swedish and
 * the app speaks three languages.
 */
const CODES = {
  included_drink_window_closed: "goWell.errorWindowClosed",
  included_drink_meal_required: "goWell.errorMealRequired",
  included_drink_line_required: "goWell.errorLineRequired",
  included_drink_line_not_found: "goWell.errorLineNotFound",
  included_drink_line_ambiguous: "goWell.errorLineNotFound",
  included_drink_not_gowell: "goWell.errorNotGoWell",
  included_drink_unavailable: "goWell.errorUnavailable",
  included_drink_out_of_stock: "goWell.errorOutOfStock",
  included_drink_invalid: "goWell.errorInvalid",
} as const;

type IncludedDrinkCode = keyof typeof CODES;

/** What the client should do with its own state after a given failure. */
export type IncludedDrinkRecovery = "refetch-status" | "refetch-drinks" | "reselect";

const RECOVERY: Record<IncludedDrinkCode, IncludedDrinkRecovery> = {
  // The window shut between showing the offer and submitting.
  included_drink_window_closed: "refetch-status",
  included_drink_meal_required: "refetch-status",
  // The chosen line is gone or unclear — let the customer pick again.
  included_drink_line_required: "reselect",
  included_drink_line_not_found: "reselect",
  included_drink_line_ambiguous: "reselect",
  // The product changed underneath us.
  included_drink_not_gowell: "refetch-drinks",
  included_drink_unavailable: "refetch-drinks",
  included_drink_out_of_stock: "refetch-drinks",
  included_drink_invalid: "refetch-drinks",
};

function codeOf(error: unknown): IncludedDrinkCode | null {
  const details = (error as ApiError | undefined)?.details as { code?: string } | undefined;
  const code = details?.code;
  return typeof code === "string" && code in CODES ? (code as IncludedDrinkCode) : null;
}

/** True when the order was refused because of the included drink. A network
 * failure carries no code, so it never matches — and the selection survives. */
export function isIncludedDrinkError(error: unknown): boolean {
  return codeOf(error) !== null;
}

export function includedDrinkRecovery(error: unknown): IncludedDrinkRecovery | null {
  const code = codeOf(error);
  return code ? RECOVERY[code] : null;
}

export function includedDrinkErrorMessage(error: unknown, t: TFunction): string | null {
  const code = codeOf(error);
  return code ? t(CODES[code]) : null;
}
