import type { ApiDrink } from "@/services/api/drinks";

/**
 * Cart domain types — ported FIELD-FOR-FIELD from Nutri-Frontend's
 * src/types/index.ts (Meal / Ingredient / MealSlot / CartItem). The mobile
 * cart must serialize to the exact same JSON shape the web stores under
 * localStorage["nutri-cart"] (spec §11.1) so pricing, checkout mapping and
 * any future cross-platform tooling stay contract-identical. Do not add,
 * rename or drop fields here without changing the web type in the same
 * commit-set.
 */

export interface MealSize {
  id: string;
  label: string;
  priceMultiplier: number;
  macroMultiplier: number;
}

export interface Meal {
  id: string;
  name: string;
  description: string;
  descriptionEn?: string | null;
  image: string;
  /** SEK (kronor, decimal) — same exception as ApiMeal.basePrice. */
  basePrice: number;
  category: string;
  available: boolean;
  macros: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
  };
  ingredients: Ingredient[];
  sizes: MealSize[];
  mealTimeTags?: string[];
  badgeText?: string;
  portionMode?: string;
}

export interface Ingredient {
  ingredientId?: string;
  name: string;
  nameEn?: string | null;
  amountG: number;
  pricePer100g?: number;
  allergens?: string[];
}

export type MealSlot = "Frukost" | "Lunch" | "Middag" | "Mellanmål";

export interface CartItem {
  /** `${mealId}-${sizeId}` for regular items (dedupes on re-add),
   * `${mealId}-custom-${uuid}` for custom items (never dedupes),
   * `drink-${drinkId}` for drinks. Same id scheme as the web CartContext. */
  id: string;
  /** Present even for drinks (synthetic Meal wrapper — web parity). */
  meal: Meal;
  sizeId: string;
  quantity: number;
  isCustom?: boolean;
  customMacros?: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
  };
  customIngredients?: { ingredientId: string; name: string; amountG: number }[];
  ingredientSurchargeKr?: number;
  containerTypeId?: string;
  /** Frontend-only meal-slot tag for Heldag flows. Not sent to backend in V1. */
  slot?: MealSlot;
  /**
   * Optional human-readable label sent to backend (POST /api/orders) as
   * OriginalMealName so custom-meal lines (MealId=null) show the customer's
   * chosen meal in kitchen/receipt/history instead of "Custom 700ml: …".
   */
  originalMealName?: string;
  /** "drink" for drink cart lines; absent or "meal" for regular meal lines. */
  kind?: "meal" | "drink";
  /** Populated only when kind === "drink". Stores the original ApiDrink for order payload mapping. */
  drink?: ApiDrink;
}
