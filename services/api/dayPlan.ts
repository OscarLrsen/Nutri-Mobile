import { apiClient, requireAuth } from "./client";

/**
 * Saved day plan ("Planera din dag") — Nutri Anpassar READS today's saved
 * plan so its slot targets follow the user's own plan instead of the
 * engine baseline. Ported from the web's dayPlanApi (spec §14.2); save was
 * added in patch 12 for the mobile day-planner port. The server row is the
 * single source of truth — no local parallel plan is ever kept.
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

/** Mirrors the web's SaveDayPlanRequest — the payload DaySetupPlanner
 * sends; the server upserts today's row and stays source of truth. */
export interface SaveDayPlanRequest {
  mealCount: number;
  isManuallyEdited: boolean;
  meals: SavedMealSlotDto[];
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
}

/** POST /api/day-plan — save/replace today's plan (patch 12: the mobile
 * "Planera din dag" port of the web dayPlanApi.save). */
export async function saveTodayDayPlan(req: SaveDayPlanRequest): Promise<SavedDayPlanResponse> {
  const { data } = await apiClient.post<SavedDayPlanResponse>("/api/day-plan", req, requireAuth());
  return data;
}
