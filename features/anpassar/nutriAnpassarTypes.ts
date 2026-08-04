import type { ApiMealDistribution, MacroTargetDto } from "@/services/api/nutrition";

/**
 * Verbatim port of Nutri-Frontend's
 * src/features/nutri-anpassar/nutriAnpassarTypes.ts.
 */
export type NutriMode = "safe" | "coach";
export type NutriTimePhase = "early" | "mid" | "late" | "outside";
export type NutriGoalType = "fat_loss" | "balanced" | "muscle_gain";

/** Backend PrimaryGoal → engine goal type. One mapping, shared by the
 * Anpassar wizard and the personalized menu so they can never disagree. */
export function mapGoalType(primaryGoal: string): NutriGoalType {
  if (primaryGoal === "FatLoss") return "fat_loss";
  if (primaryGoal === "MuscleGain") return "muscle_gain";
  return "balanced";
}

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
