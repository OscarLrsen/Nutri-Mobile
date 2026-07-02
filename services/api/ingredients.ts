import { apiClient } from "./client";

/**
 * Ingredient library — PUBLIC endpoint (no auth). Type copied
 * field-for-field from Nutri-Frontend's src/lib/api.ts `ApiIngredient`,
 * mirroring the backend's IngredientLibraryDto (spec §2.1). Note: the
 * public variant zeroes out the internal `pricePer100g` cost field —
 * only `customSellPricePer100g` is real customer-facing pricing.
 *
 * Used here to build the allergen map for meal cards/detail (the meal DTO
 * itself carries ingredient ids but not allergens — allergens live on the
 * ingredient library entries, exactly as on the web /meny page).
 */
export interface ApiIngredient {
  id: string;
  name: string;
  nameEn?: string | null;
  category: string;
  defaultAmountG: number;
  allergens: string[];
  calories100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
  fiberG100g: number;
  pricePer100g: number;
  customSellPricePer100g: number;
  minAmountG?: number | null;
  maxAmountG?: number | null;
  isExtraOption?: boolean;
}

/** GET /api/ingredients — public. */
export async function getIngredients(): Promise<ApiIngredient[]> {
  const { data } = await apiClient.get<ApiIngredient[]>("/api/ingredients");
  return data;
}
