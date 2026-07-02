/**
 * Verified business-rule constants ported from the backend, exactly as
 * documented in NUTRI_MOBILE_TECHNICAL_SPECIFICATION_V1.md — never guessed,
 * never re-derived. These are pure data, not logic: no feature is
 * implemented against them yet, but any future feature that needs them
 * (checkout reservation countdown, abuse-guard messaging, etc.) should
 * import from here rather than re-hardcoding the numbers.
 *
 * Source of truth is always the backend — if these ever drift from
 * Controllers/OrdersController.cs, the backend wins and this file must be
 * updated, never the other way around.
 */

/** Order.ReservedUntil window for pay_on_site orders. Spec §18.1/§19. */
export const PAY_ON_SITE_RESERVATION_MINUTES = 10;

/** Order.ReservedUntil window for stripe orders (longer — hosted payment
 * methods routinely exceed 10 minutes). Spec §18.2/§19. */
export const STRIPE_RESERVATION_MINUTES = 30;

/** Max expired pay-on-site reservations per email in a 24h window before
 * the backend blocks further reservations with a 403. Spec §1.2/§18.1. */
export const ABUSE_GUARD_MAX_EXPIRED_RESERVATIONS = 3;
export const ABUSE_GUARD_WINDOW_HOURS = 24;

/** Default VAT rate (Tax:VatRate config, Swedish takeaway-food rate).
 * Spec §7/§18.5 — always prefer the rate returned on the order/receipt DTO
 * (VatRateSnapshot) over this default once an order exists; this constant
 * is only useful for pre-order estimates. */
export const DEFAULT_VAT_RATE = 0.06;

/** First-N-customers welcome-discount quota. Spec §1.6. */
export const WELCOME_DISCOUNT_CUSTOMER_QUOTA = 100;
export const WELCOME_DISCOUNT_PERCENT = 20;
