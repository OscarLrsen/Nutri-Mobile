import { apiClient } from "./client";

/**
 * Custom-meal calculation — PUBLIC, server-authoritative nutrition + price
 * for a container + ingredient-gram list. Ported from the web's
 * customMealApi (spec §2.13/§14.2). The backend reuses this same logic when
 * pricing custom order lines — the client NEVER submits a price.
 */
export interface CustomMealCalculateRequest {
  containerTypeId: string;
  items: { ingredientId: string; grams: number }[];
}

export interface CustomMealCalculateResponse {
  totalKcal: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
  totalWeightGrams: number;
  totalPriceOre: number;
  containerCount: number;
  containerName: string;
  warnings: string[];
}

/** POST /api/custom-meal/calculate — public. */
export async function calculateCustomMeal(
  req: CustomMealCalculateRequest
): Promise<CustomMealCalculateResponse> {
  const { data } = await apiClient.post<CustomMealCalculateResponse>(
    "/api/custom-meal/calculate",
    req
  );
  return data;
}
