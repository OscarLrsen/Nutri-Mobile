import type { TFunction } from "i18next";
import type { ApiError } from "@/types/api";

/**
 * Stamp card failures from POST /api/orders (patch 16C2).
 *
 * The backend returns a STABLE code alongside its message. We map the code,
 * never the message text: the server speaks Swedish, the app speaks three
 * languages, and matching on prose would break the moment anyone rewords an
 * error.
 */
// `as const` so the values stay literal i18n key types — a plain
// Record<string, string> would defeat the typed t() the project relies on.
const STAMP_CARD_CODES = {
  stamp_card_already_redeemed: "stampCardCheckout.errorAlreadyRedeemed",
  stamp_card_reserved_elsewhere: "stampCardCheckout.errorReservedElsewhere",
  stamp_card_revoked: "stampCardCheckout.errorRevoked",
  stamp_card_reward_revoked: "stampCardCheckout.errorRevoked",
  stamp_card_reward_not_found: "stampCardCheckout.errorNotFound",
  stamp_card_invalid: "stampCardCheckout.errorNotFound",
  stamp_card_line_not_found: "stampCardCheckout.errorLineMissing",
  stamp_card_line_not_qualifying: "stampCardCheckout.errorLineNotQualifying",
  stamp_card_line_ambiguous: "stampCardCheckout.errorLineMissing",
  stamp_card_line_required: "stampCardCheckout.errorLineRequired",
  discount_conflict: "stampCardCheckout.errorConflict",
} as const;

type StampCardErrorCode = keyof typeof STAMP_CARD_CODES;

function codeOf(error: unknown): string | null {
  const details = (error as ApiError | undefined)?.details as { code?: string } | undefined;
  return typeof details?.code === "string" ? details.code : null;
}

/** True when the order was refused because of the stamp card selection. */
export function isStampCardError(error: unknown): boolean {
  const code = codeOf(error);
  return code !== null && code in STAMP_CARD_CODES;
}

/**
 * True when the selection is definitively dead server-side, so keeping it
 * would only fail again. A conflict is NOT in this set: there the reward is
 * still fine, the customer just has two discounts selected.
 */
export function isStampCardSelectionDead(error: unknown): boolean {
  const code = codeOf(error);
  return (
    code === "stamp_card_already_redeemed" ||
    code === "stamp_card_reserved_elsewhere" ||
    code === "stamp_card_revoked" ||
    code === "stamp_card_reward_revoked" ||
    code === "stamp_card_reward_not_found" ||
    code === "stamp_card_invalid"
  );
}

/** Customer-facing copy for a stamp card failure, or null if not one. */
export function stampCardErrorMessage(error: unknown, t: TFunction): string | null {
  const code = codeOf(error);
  if (!code || !(code in STAMP_CARD_CODES)) return null;
  return t(STAMP_CARD_CODES[code as StampCardErrorCode]);
}
