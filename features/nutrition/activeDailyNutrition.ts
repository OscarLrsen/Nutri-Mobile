import type {
  ApiTodayNutrition,
  MacroTargetDto,
} from "@/services/api/nutrition";
import type { SavedDayPlanResponse } from "@/services/api/dayPlan";

/**
 * ActiveDailyNutrition (patch 13) — the ONE shared, derived presentation
 * model for "today's active nutrition" used by Home, Profile, the day
 * planner and (via mealRecommendation) the menu.
 *
 * NOT a new source of truth: it only NORMALISES the backend's existing
 * answers into named concepts so every surface speaks the same language.
 * No BMR/TDEE/calorie math, no portion algorithm, no price or ingredient
 * logic happens here — the only arithmetic is summing the server's own
 * saved plan slots for display.
 *
 * The named concepts (locked by patch 13):
 * - `target`      = the ACTIVE DAILY GOAL: the backend's carb-cycled
 *                   `adjustedTarget` from /nutrition-profile/today. This
 *                   is what "Dagens plan", "dagens mål" and "kvar av
 *                   dagens mål" all refer to. /remaining-today is built by
 *                   the backend from this same value.
 * - `baseTarget`  = the baseline plan BEFORE day-type adjustment — the
 *                   same numbers /nutrition-profile/result shows on
 *                   Profile's "Din aktiva plan" (base plan). On days
 *                   without carb cycling (override/no schedule) it equals
 *                   `target`.
 * - `planned`     = the sum of the user's SAVED day-plan slots for today
 *                   (server row from /day-plan/today), or null when no
 *                   plan is saved. A saved plan never replaces the goal —
 *                   it is shown AS a plan next to it.
 * - `dayType`     = the backend's day type (Rest/Training/…), identical
 *                   on every surface because it comes from one endpoint.
 *
 * Source priority for slot targets lives in
 * features/menu/mealRecommendation.ts (saved plan → automatic
 * distribution → fallback share); this model carries the same `source`
 * marker so UI can label honestly.
 */

export interface ActiveDailyNutrition {
  /** The active daily goal — backend adjustedTarget (carb-cycled). */
  target: MacroTargetDto;
  /** Baseline before day-type adjustment (= /result's numbers). */
  baseTarget: MacroTargetDto;
  /** Sum of the saved day plan's slots, or null when none is saved. */
  planned: Omit<MacroTargetDto, "fiberG"> | null;
  dayType: string | null;
  /** True when the saved plan was manually edited by the user. */
  isManuallyEdited: boolean;
  source: "saved-day-plan" | "automatic-day-plan" | "nutrition-target";
}

/** Difference beyond which "planned" is surfaced as its own concept —
 * within this band plan and goal are presented as the same number
 * (rounding noise, not a real deviation). */
export const PLANNED_DEVIATION_EPSILON_KCAL = 10;

export function deriveActiveDailyNutrition(
  today: ApiTodayNutrition | undefined,
  savedPlan: SavedDayPlanResponse | null | undefined
): ActiveDailyNutrition | null {
  if (!today) return null;

  const hasSavedPlan = !!savedPlan && savedPlan.meals.length > 0;
  const planned = hasSavedPlan
    ? {
        calories: savedPlan.totalCalories,
        proteinG: savedPlan.totalProteinG,
        carbsG: savedPlan.totalCarbsG,
        fatG: savedPlan.totalFatG,
      }
    : null;

  return {
    target: today.adjustedTarget,
    baseTarget: today.baseTarget,
    planned,
    dayType: today.dayType,
    isManuallyEdited: hasSavedPlan ? savedPlan.isManuallyEdited : false,
    source: hasSavedPlan
      ? "saved-day-plan"
      : today.meals.length > 0
        ? "automatic-day-plan"
        : "nutrition-target",
  };
}

/** True when the saved plan's total deviates enough from the active goal
 * that the UI must present "Mål" and "Planerat" as two named concepts. */
export function plannedDeviatesFromTarget(active: ActiveDailyNutrition): boolean {
  return (
    active.planned !== null &&
    Math.abs(active.planned.calories - active.target.calories) > PLANNED_DEVIATION_EPSILON_KCAL
  );
}
