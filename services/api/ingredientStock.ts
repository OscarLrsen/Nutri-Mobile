import { apiClient } from "./client";

/** Public ingredient stock — StepAdjust hides extras that are explicitly
 * out of stock. Ported from the web's ingredientStockApi (spec §14.2). */
export interface IngredientStockDto {
  ingredientId: string;
  availableGrams: number;
  isLow: boolean;
  lowThresholdGrams: number;
}

/** GET /api/ingredients/stock — public. */
export async function getIngredientStock(): Promise<IngredientStockDto[]> {
  const { data } = await apiClient.get<IngredientStockDto[]>("/api/ingredients/stock");
  return data;
}
