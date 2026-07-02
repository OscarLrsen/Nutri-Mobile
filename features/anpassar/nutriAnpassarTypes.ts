import type { ApiMealDistribution, MacroTargetDto } from "@/services/api/nutrition";

/**
 * Verbatim port of Nutri-Frontend's
 * src/features/nutri-anpassar/nutriAnpassarTypes.ts.
 */
export type NutriMode = "safe" | "coach";
export type NutriTimePhase = "early" | "mid" | "late" | "outside";
export type NutriGoalType = "fat_loss" | "balanced" | "muscle_gain";

export interface NutriAdaptiveTargetInput {
  selectedSlot: string;
  nowHour: number;
  goalType: NutriGoalType;
  /** Planned meals for today from getToday() */
  todayMeals: ApiMealDistribution[];
  /** remainingResult.remainingToday */
  remaining: MacroTargetDto;
  /** remainingResult.consumedToday — used to determine safe vs coach mode */
  consumedToday: MacroTargetDto;
  /** todayResult.adjustedTarget.calories — used for meal min/max caps */
  dailyCalories: number;
}
