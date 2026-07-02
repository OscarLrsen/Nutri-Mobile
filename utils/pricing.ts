/**
 * Ported from Nutri-Frontend's src/lib/meals.ts — the multipliers and
 * rounding MUST match Nutri-Backend/Services/SizeHelper.cs (small 0.8,
 * medium 1.0, large 1.2; one multiplier for both price and macros) and
 * OrdersController.Create's fixed-meal pricing:
 *
 *   unitPriceKr  = (int)Math.Round(basePrice * mult, AwayFromZero)
 *   unitPriceOre = unitPriceKr * 100
 *
 * Foodtruck pricing is whole-SEK. JS Math.round rounds half away from zero
 * for positive values, matching MidpointRounding.AwayFromZero. If either
 * the backend or the web frontend ever changes these values, this file must
 * change in the same commit-set — three copies of one contract.
 */
export const MEAL_SIZES = [
  { id: "small", label: "Small", priceMultiplier: 0.8, macroMultiplier: 0.8 },
  { id: "medium", label: "Medium", priceMultiplier: 1.0, macroMultiplier: 1.0 },
  { id: "large", label: "Large", priceMultiplier: 1.2, macroMultiplier: 1.2 },
] as const;

export type MealSizeId = (typeof MEAL_SIZES)[number]["id"];

/**
 * Customer-visible size options — SMALL IS HIDDEN from customers, exactly
 * like the web /meny page (SIZE_OPTIONS filters it out; the size remains in
 * MEAL_SIZES because backend/POS still use it).
 */
export const CUSTOMER_SIZE_OPTIONS = MEAL_SIZES.filter((s) => s.id !== "small").map((s) => ({
  id: s.id,
  label: s.id === "medium" ? "M" : "L",
  priceMultiplier: s.priceMultiplier,
  macroMultiplier: s.macroMultiplier,
}));

export function previewMealPriceKr(basePrice: number, priceMultiplier: number): number {
  return Math.round(basePrice * priceMultiplier);
}

export function previewMealPriceOre(basePrice: number, priceMultiplier: number): number {
  return previewMealPriceKr(basePrice, priceMultiplier) * 100;
}
