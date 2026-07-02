import type { CartItem } from "@/types/cart";
import { MEAL_SIZES } from "@/utils/pricing";

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
  const size = MEAL_SIZES.find((s) => s.id === item.sizeId);
  const mult = size?.macroMultiplier ?? 1;
  const baseGrams = item.meal.ingredients.reduce((sum, ing) => sum + (ing.amountG ?? 0), 0);
  return Math.round(baseGrams * mult) * item.quantity;
}
