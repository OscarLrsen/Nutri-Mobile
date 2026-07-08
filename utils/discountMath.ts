/**
 * Preview-only port of the backend's Services/DiscountMath.Apply — the exact
 * whole-SEK rounding and invariant clamps the server uses when it applies a
 * coupon in OrdersController.Create. Kept verbatim so the cart's discount
 * preview matches the receipt for fixed-price lines.
 *
 * IMPORTANT: this is a PREVIEW. The backend recomputes the discount
 * authoritatively at order time from the coupon row itself; the client never
 * sends amounts, only CreateOrderDto.CouponId. Custom/Nutri Anpassar lines
 * use a float price approximation in the cart (see CartContext), so their
 * previewed discount may differ by an öre-rounding step from the receipt.
 */
export function applyDiscountPreview(
  subtotalOre: number,
  discountPercent: number
): { totalOre: number; discountAmountOre: number } {
  // Defense-in-depth: subtotal must be non-negative, percent clamped 0–100.
  if (subtotalOre < 0) subtotalOre = 0;
  const percent = discountPercent < 0 ? 0 : discountPercent > 100 ? 100 : discountPercent;

  // C# integer division on non-negative operands === Math.floor here.
  const rawDiscountOre = Math.floor((subtotalOre * percent) / 100);
  const discountedOre = subtotalOre - rawDiscountOre;

  // Round to nearest whole SEK, half away from zero (C# MidpointRounding
  // .AwayFromZero; Math.round halves-up equals it for non-negative input).
  let totalOre = Math.round(discountedOre / 100) * 100;

  // Invariant clamp: never charge more than the subtotal, never negative.
  if (totalOre > subtotalOre) totalOre = subtotalOre;
  if (totalOre < 0) totalOre = 0;

  let discountAmountOre = subtotalOre - totalOre;
  if (discountAmountOre < 0) discountAmountOre = 0;

  return { totalOre, discountAmountOre };
}
