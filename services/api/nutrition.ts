import { apiClient, requireAuth } from "./client";

/**
 * Nutrition profile endpoints used by Nutri Anpassar — ported from
 * Nutri-Frontend's nutritionProfileApi (spec §2.9/§14.2). Both are
 * AUTHENTICATED (Bearer). Only the members Anpassar consumes are ported;
 * the profile upsert/preview/override endpoints belong to the future
 * onboarding/profile feature.
 */

export interface MacroTargetDto {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface ApiMealDistribution {
  label: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  timingPurpose: string;
}

export interface ApiTodayNutrition {
  dayType: string | null;
  headline: string;
  subline: string;
  baseTarget: MacroTargetDto;
  adjustedTarget: MacroTargetDto;
  primaryGoal: string;
  goalPace: string | null;
  meals: ApiMealDistribution[];
}

export interface ApiRemainingToday {
  adjustedTarget: MacroTargetDto;
  consumedToday: MacroTargetDto;
  remainingToday: MacroTargetDto;
}

/** GET /api/nutrition-profile/today — carb-cycled daily target + meal
 * distribution. Normalizes absent `meals` to [] (web parity). */
export async function getTodayNutrition(): Promise<ApiTodayNutrition> {
  const { data } = await apiClient.get<ApiTodayNutrition>(
    "/api/nutrition-profile/today",
    requireAuth()
  );
  return { ...data, meals: data.meals ?? [] };
}

/** GET /api/nutrition-profile/remaining-today — adjusted target minus
 * macros consumed from today's counted orders. */
export async function getRemainingToday(): Promise<ApiRemainingToday> {
  const { data } = await apiClient.get<ApiRemainingToday>(
    "/api/nutrition-profile/remaining-today",
    requireAuth()
  );
  return data;
}
