import { apiClient, requireAuth } from "./client";

/**
 * Saved day plan ("Sätt upp din dag" / Heldag) — Nutri Anpassar READS
 * today's saved plan so its slot targets follow the user's own plan instead
 * of the engine baseline. Ported from the web's dayPlanApi (spec §14.2).
 * Only getToday is ported; saving a plan belongs to the future Heldag
 * feature.
 */

export interface SavedMealSlotDto {
  label: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface SavedDayPlanResponse {
  date: string;
  mealCount: number;
  isManuallyEdited: boolean;
  meals: SavedMealSlotDto[];
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  savedAt: string;
}

/** GET /api/day-plan/today — authenticated; null when no plan is saved
 * (or on any error — web parity: dayPlanApi.getToday catches everything). */
export async function getTodayDayPlan(): Promise<SavedDayPlanResponse | null> {
  try {
    const { data } = await apiClient.get<SavedDayPlanResponse>("/api/day-plan/today", requireAuth());
    return data;
  } catch {
    return null;
  }
}
