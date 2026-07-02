import type { NutriGoalType, NutriTimePhase } from "./nutriAnpassarTypes";

/**
 * Verbatim port of Nutri-Frontend's
 * src/features/nutri-anpassar/nutriAnpassarRules.ts. These numbers ARE the
 * product ("Nutri räknar åt dig") — never tweak them on one platform only.
 */
export const HARD_CAP_KCAL = 1500;

export function getTimePhase(hour: number): NutriTimePhase {
  if (hour >= 10 && hour < 13) return "early";
  if (hour >= 13 && hour < 17) return "mid";
  if (hour >= 17 && hour < 20) return "late";
  return "outside";
}

export function getMealCaps(
  goalType: NutriGoalType,
  dailyCalories: number
): { min: number; max: number } {
  switch (goalType) {
    case "fat_loss":
      return {
        min: dailyCalories * 0.2,
        max: Math.min(dailyCalories * 0.35, HARD_CAP_KCAL),
      };
    case "balanced":
      return {
        min: dailyCalories * 0.22,
        max: Math.min(dailyCalories * 0.4, HARD_CAP_KCAL),
      };
    case "muscle_gain":
      return {
        min: dailyCalories * 0.25,
        max: Math.min(dailyCalories * 0.5, HARD_CAP_KCAL),
      };
  }
}

/** Calorie adjustment factor per mode, phase, and goal */
export function getCalorieFactor(
  mode: "safe" | "coach",
  phase: NutriTimePhase,
  goalType: NutriGoalType
): number {
  if (mode === "safe") {
    if (phase === "mid") {
      if (goalType === "fat_loss") return 1.05;
      if (goalType === "balanced") return 1.1;
      if (goalType === "muscle_gain") return 1.15;
    }
    return 1.0;
  }

  // coach mode
  if (phase === "early") return 1.0;
  if (phase === "mid") {
    if (goalType === "fat_loss") return 1.05;
    if (goalType === "balanced") return 1.1;
    if (goalType === "muscle_gain") return 1.15;
  }
  if (phase === "late") {
    if (goalType === "fat_loss") return 1.0;
    if (goalType === "balanced") return 1.05;
    if (goalType === "muscle_gain") return 1.1;
  }
  return 1.0; // outside
}
