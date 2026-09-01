import type { CartItem } from "@/types/cart";
import { MEAL_SIZES, previewMealPriceOre } from "@/utils/pricing";

/**
 * Per-item cart math, ported from the helpers in Nutri-Frontend's
 * src/app/varukorg/page.tsx (getItemMacros) so cart nutrition totals are
 * identical on both platforms. Size-scaled macros round per-size FIRST and
 * multiply by quantity after — same order of operations as the web, which
 * matters (round-then-multiply ≠ multiply-then-round).
 */
export function getItemMacros(
  item: CartItem,
  qty?: number
): { kcal: number; protein: number; carbs: number; fat: number; fiber: number } {
  const itemQty = qty ?? item.quantity;
  if (item.kind === "drink" && item.drink) {
    return {
      kcal: (item.drink.calories ?? 0) * itemQty,
      protein: (item.drink.proteinG ?? 0) * itemQty,
      carbs: (item.drink.carbsG ?? 0) * itemQty,
      fat: (item.drink.fatG ?? 0) * itemQty,
      fiber: 0,
    };
  }
  const size = MEAL_SIZES.find((s) => s.id === item.sizeId);
  const mult = size?.macroMultiplier ?? 1;
  const base =
    item.isCustom && item.customMacros
      ? item.customMacros
      : {
          calories: Math.round(item.meal.macros.calories * mult),
          proteinG: Math.round(item.meal.macros.proteinG * mult),
          carbsG: Math.round(item.meal.macros.carbsG * mult),
          fatG: Math.round(item.meal.macros.fatG * mult),
          fiberG: Math.round(item.meal.macros.fiberG * mult),
        };
  return {
    kcal: base.calories * itemQty,
    protein: base.proteinG * itemQty,
    carbs: base.carbsG * itemQty,
    fat: base.fatG * itemQty,
    fiber: (base.fiberG ?? 0) * itemQty,
  };
}

/**
 * Total food weight of a cart line in grams — the same formula the web cart
 * uses to *display* per-line grams (Math.round(Σ ingredient.amountG ×
 * macroMultiplier)), summed across quantity. Drinks contribute 0 (the web
 * shows their volumeML instead; volume is not weight). The web exposes no
 * cart-wide weight total, so this helper exists only to back the mobile
 * cart's totalWeightG selector.
 */
export function getItemWeightG(item: CartItem): number {
  if (item.kind === "drink") return 0;
  // A custom/personalized line's grams ARE the optimizer's output — the
  // recipe amounts are not what was ordered, and no size multiplier applies
  // (the backend stores these grams verbatim with Size = "medium"). Scaling
  // them by a leftover sizeId was a size multiplier on a personalized line.
  if (item.isCustom && item.customIngredients) {
    const customGrams = item.customIngredients.reduce((sum, ing) => sum + (ing.amountG ?? 0), 0);
    return customGrams * item.quantity;
  }
  const size = MEAL_SIZES.find((s) => s.id === item.sizeId);
  const mult = size?.macroMultiplier ?? 1;
  const baseGrams = item.meal.ingredients.reduce((sum, ing) => sum + (ing.amountG ?? 0), 0);
  return Math.round(baseGrams * mult) * item.quantity;
}

/**
 * The unit price of a cart line, in öre — THE single pricing authority for
 * cart display and summation. CartContext's totals and CartScreen's line
 * rendering both call this, so a price can never differ between the row and
 * the summary.
 *
 * WHY IT EXISTS. The same formula used to live in two places, and for
 * custom/personalized lines both reconstructed the price from a
 * whole-kronor surcharge — so the server's öre-precise 18586 became 18600 on
 * screen and in the total. Rules, in order:
 *
 *  - drink lines: the drink's own öre price, unchanged;
 *  - custom lines that carry customPriceOre: EXACTLY that number — this is
 *    the backend's /custom-meal/calculate result and the whole point;
 *  - legacy custom/surcharge lines (persisted carts from before
 *    customPriceOre existed): the historical basePrice×multiplier+surcharge
 *    formula, unchanged so an old stored cart prices as it always did;
 *  - fixed meals: the backend's whole-SEK rounding via previewMealPriceOre,
 *    unchanged.
 *
 * The order payload still carries no price and the backend recomputes from
 * ingredient grams — this is honest display, not price authority.
 */
export function getItemUnitPriceOre(item: CartItem): number {
  if (item.kind === "drink" && item.drink) {
    return item.drink.priceOre;
  }

  if (item.isCustom && item.customPriceOre !== undefined) {
    return item.customPriceOre;
  }

  const size = MEAL_SIZES.find((s) => s.id === item.sizeId);
  const multiplier = size?.priceMultiplier ?? 1;
  const surcharge = item.ingredientSurchargeKr ?? 0;

  if (!item.isCustom && surcharge === 0) {
    return previewMealPriceOre(item.meal.basePrice, multiplier);
  }

  // Legacy path — kronor float, rounded to öre exactly as krToOre always did.
  return Math.round((item.meal.basePrice * multiplier + surcharge) * 100);
}

/** Line total in öre: integer unit price × integer quantity — no float leg. */
export function getItemLineTotalOre(item: CartItem): number {
  return getItemUnitPriceOre(item) * item.quantity;
}
