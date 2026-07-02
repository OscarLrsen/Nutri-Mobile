import { apiClient, requireAuth } from "./client";
import type { ApiError } from "@/types/api";

/**
 * Nutrition profile endpoints — ported from Nutri-Frontend's
 * nutritionProfileApi (spec §2.9/§14.2). All AUTHENTICATED (Bearer) except
 * preview, which is public on the backend (web calls it without auth).
 * Consumed by Nutri Anpassar (today/remaining) and the Profil feature
 * (get/upsert/result/preview/override).
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

/* ── Profile CRUD + result (Profil feature) ─────────────────── */

export interface ApiNutritionProfile {
  userId: string;
  gender: string;
  ageYears: number;
  weightKg: number;
  heightCm: number;
  bodyFatLevel: number | null;
  targetWeightKg: number | null;
  activityType: string;
  stepsRange: string | null;
  trainingSessions: string | null;
  primaryGoal: string;
  goalPace: string | null;
  mealCountMain: number;
  mealCountSnacks: number;
  isComplete: boolean;
  missingFields: string[];
  // Female-specific (null for male or when user skipped)
  isPostmenopausal: boolean | null;
  cyclePhase: string | null;
  planFocus: string | null;
}

export interface ApiNutritionResult {
  calorieTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  activityScore: number;
  activityLabel: string;
  tdee: number;
  calorieFloorApplied: boolean;
  meals: ApiMealDistribution[];
  primaryGoal: string;
  goalPace: string | null;
  mode: "Auto" | "CustomMacros";
  userCalorieTarget: number | null;
}

export interface UpsertNutritionProfileDto {
  gender: string;
  ageYears: number;
  weightKg: number;
  heightCm: number;
  bodyFatLevel: number | null;
  targetWeightKg: number | null;
  activityType: string;
  stepsRange: string | null;
  trainingSessions: string | null;
  primaryGoal: string;
  goalPace: string | null;
  mealCountMain: number;
  mealCountSnacks: number;
  // Female-specific (undefined/null → backend treats as not provided)
  isPostmenopausal?: boolean | null;
  cyclePhase?: string | null;
  planFocus?: string | null;
}

export interface MacroOverrideDto {
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  userCalorieTarget?: number | null;
}

/** GET /api/nutrition-profile — null when none exists yet (404, web parity). */
export async function getNutritionProfile(): Promise<ApiNutritionProfile | null> {
  try {
    const { data } = await apiClient.get<ApiNutritionProfile>(
      "/api/nutrition-profile",
      requireAuth()
    );
    return data;
  } catch (e) {
    if ((e as ApiError | undefined)?.status === 404) return null;
    throw e;
  }
}

/** PUT /api/nutrition-profile — upsert (auth). */
export async function upsertNutritionProfile(
  dto: UpsertNutritionProfileDto
): Promise<ApiNutritionProfile> {
  const { data } = await apiClient.put<ApiNutritionProfile>(
    "/api/nutrition-profile",
    dto,
    requireAuth()
  );
  return data;
}

/** GET /api/nutrition-profile/result — active targets (auth). */
export async function getNutritionResult(): Promise<ApiNutritionResult> {
  const { data } = await apiClient.get<ApiNutritionResult>(
    "/api/nutrition-profile/result",
    requireAuth()
  );
  return data;
}

/** POST /api/nutrition-profile/preview — PUBLIC calculation preview. */
export async function previewNutritionResult(
  dto: UpsertNutritionProfileDto
): Promise<ApiNutritionResult> {
  const { data } = await apiClient.post<ApiNutritionResult>(
    "/api/nutrition-profile/preview",
    dto
  );
  return data;
}

/** PUT /api/nutrition-profile/override — manual macro override (auth). */
export async function upsertMacroOverride(dto: MacroOverrideDto): Promise<MacroOverrideDto> {
  const { data } = await apiClient.put<MacroOverrideDto>(
    "/api/nutrition-profile/override",
    dto,
    requireAuth()
  );
  return data;
}

/** DELETE /api/nutrition-profile/override — back to Nutri's recommendation (auth). */
export async function deleteMacroOverride(): Promise<void> {
  await apiClient.delete("/api/nutrition-profile/override", requireAuth());
}
