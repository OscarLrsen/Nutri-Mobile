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
  /**
   * True for the GoWell family (patch 17B). Admin-set on the backend and
   * the ONLY thing business logic may read — goWellFlavors.ts matches names
   * for gradients, which must never decide what a customer gets free.
   * Optional so an older API simply yields no GoWell.
   */
  isGoWell?: boolean;
  /**
   * Translated copy (backend AddDrinkLanguageFields). `name` and
   * `description` above stay the Swedish base copy and remain the canonical
   * value business logic keys on — goWellFlavors.ts looks up its visuals by
   * the Swedish name, so adding a translation must never move that lookup.
   *
   * Do not read these directly in a component: go through drinkName() /
   * drinkDescription() in features/menu/drinkText.ts, which applies the
   * app's shared fallback order. Optional, so an older API simply renders
   * Swedish everywhere instead of blanking out.
   */
  nameEn?: string | null;
  nameDa?: string | null;
  descriptionEn?: string | null;
  descriptionDa?: string | null;
}

/** GET /api/drinks — public. */
export async function getDrinks(): Promise<ApiDrink[]> {
  const { data } = await apiClient.get<ApiDrink[]>("/api/drinks");
  return data;
}
