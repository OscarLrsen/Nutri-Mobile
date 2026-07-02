import { apiClient } from "./client";

/**
 * Drinks — PUBLIC endpoint (no auth). Type copied field-for-field from
 * Nutri-Frontend's src/lib/api.ts `ApiDrink`, mirroring the backend's
 * DrinkDto (spec §2.5). The seven `show*` flags are admin-controlled
 * per-drink display toggles and MUST be respected in every UI that renders
 * drink nutrition (defaults per the backend DTO: showNutrition/showCalories/
 * showProtein/showCaffeine true; showCarbs/showFat/showFiber false).
 *
 * Note: the public endpoint obfuscates stockQuantity to 0/1 (in stock or
 * not) — never display it as an exact count.
 */
export interface ApiDrink {
  id: string;
  name: string;
  category: string;
  description: string;
  volumeML: number;
  /** Öre. */
  priceOre: number;
  calories: number;
  isAvailable: boolean;
  image: string;
  stockQuantity?: number;
  caffeineMg?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
  showNutrition?: boolean;
  showCalories?: boolean;
  showProtein?: boolean;
  showCarbs?: boolean;
  showFat?: boolean;
  showFiber?: boolean;
  showCaffeine?: boolean;
}

/** GET /api/drinks — public. */
export async function getDrinks(): Promise<ApiDrink[]> {
  const { data } = await apiClient.get<ApiDrink[]>("/api/drinks");
  return data;
}
