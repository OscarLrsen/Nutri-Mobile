import { apiClient } from "./client";

/**
 * Meals + availability — PUBLIC endpoints (no auth). Types copied
 * field-for-field from Nutri-Frontend's src/lib/api.ts (`ApiMeal`,
 * `ApiMealAvailability`, `ApiSizeAvailability`), which mirror the backend's
 * MealDto / MealAvailabilityDto / SizeAvailabilityDto (spec §2.2, §2.11).
 */

export interface ApiMeal {
  id: string;
  name: string;
  description: string;
  descriptionEn?: string | null;
  image: string;
  /** SEK (kronor, decimal) — NOT öre. The one price field on the wire that
   * isn't öre; backend MealDto.BasePrice is decimal kr. Convert via
   * utils/pricing.ts previewMealPriceOre before formatting. */
  basePrice: number;
  category: string;
  available: boolean;
  macros: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };
  ingredients: { ingredientId?: string; name: string; nameEn?: string | null; amountG: number; pricePer100g?: number }[];
  mealTimeTags: string[];
  badgeText?: string;
  portionMode?: string;
}

export interface ApiSizeAvailability {
  count: number;
  soldOut: boolean;
  limitingIngredientId: string | null;
  limitingIngredientName: string | null;
}

export interface ApiMealAvailability {
  mealId: string;
  name: string;
  category: string;
  small: ApiSizeAvailability;
  medium: ApiSizeAvailability;
  large: ApiSizeAvailability;
}

/** GET /api/meals — public; backend returns only Available=true meals. */
export async function getMeals(): Promise<ApiMeal[]> {
  const { data } = await apiClient.get<ApiMeal[]>("/api/meals");
  return data;
}

/**
 * GET /api/meals/availability — public bulk per-size stock. One round-trip
 * for the whole menu (same pattern as the web /meny page) — never call the
 * per-meal variant in a list.
 */
export async function getAllAvailability(): Promise<ApiMealAvailability[]> {
  const { data } = await apiClient.get<ApiMealAvailability[]>("/api/meals/availability");
  return data;
}
