import type { ApiMealDistribution } from "@/services/api/nutrition";
import type { NutriAdaptiveTargetInput } from "./nutriAnpassarTypes";
import { getMealCaps } from "./nutriAnpassarRules";

/**
 * Verbatim port of Nutri-Frontend's
 * src/features/nutri-anpassar/buildNutriAdaptiveTarget.ts — the engine that
 * turns "what you've eaten today + your plan" into a per-slot macro target.
 * Every branch (fully-reached top-up, safe/coach mode, missing-slot
 * fallback, hard caps, low-target rescue) is copied 1:1.
 */
const clamp = (n: number) => Math.max(0, Math.round(n));

export function buildNutriAdaptiveTarget(input: NutriAdaptiveTargetInput): ApiMealDistribution {
  const { selectedSlot, goalType, todayMeals, remaining, consumedToday, dailyCalories } = input;

  // ── A0. FULLY REACHED TODAY ─────────────────────────────────────────
  // Both daily calories and protein are at or over target — recommend a
  // minimal "top-up" rather than a full meal.
  if (remaining.calories <= 0 && remaining.proteinG <= 0) {
    const slotIdx = todayMeals.findIndex((m) => m.label === selectedSlot);
    const baseline = slotIdx >= 0 ? todayMeals[slotIdx] : null;
    const { max: mealMax } = getMealCaps(goalType, dailyCalories);
    const kcal = Math.min(Math.max(200, (baseline?.calories ?? 400) * 0.35), mealMax);
    const ratio = baseline?.calories ? kcal / baseline.calories : 0.35;
    return {
      label: baseline?.label ?? selectedSlot,
      calories: Math.round(kcal),
      proteinG: Math.max(15, Math.round((baseline?.proteinG ?? 30) * 0.35)),
      carbsG: clamp((baseline?.carbsG ?? 0) * ratio),
      fatG: clamp((baseline?.fatG ?? 0) * ratio),
      timingPurpose: baseline?.timingPurpose ?? "",
    };
  }

  // ── A. MODE SWITCH ──────────────────────────────────────────────────
  const mode = consumedToday.calories > 0 ? "coach" : "safe";

  // ── B. BASELINE ─────────────────────────────────────────────────────
  const slotIndex = todayMeals.findIndex((m) => m.label === selectedSlot);
  const hasSlot = slotIndex >= 0;
  const planned = hasSlot ? todayMeals[slotIndex] : null;

  // Fallback baseline when slot is missing: calorie-weighted share of
  // remaining, identical to the old buildRemainingAwareTarget logic.
  const fallbackBaseline = (): ApiMealDistribution => {
    const remainingSlots = todayMeals.filter((_, i) => i >= slotIndex || !hasSlot);
    const totalWeight = remainingSlots.reduce((s, m) => s + m.calories, 0);
    const share = totalWeight > 0 ? 1 / remainingSlots.length : 1;
    const { max } = getMealCaps(goalType, dailyCalories);
    return {
      label: selectedSlot,
      calories: clamp(Math.min(remaining.calories * share, max)),
      proteinG: clamp(remaining.proteinG * share),
      carbsG: clamp(remaining.carbsG * share),
      fatG: clamp(remaining.fatG * share),
      timingPurpose: "",
    };
  };

  const baseline: ApiMealDistribution = planned ?? fallbackBaseline();

  // ── C / D. CALORIE ADJUSTMENT ────────────────────────────────────────
  // "Sätt upp din dag" is source of truth — slot target is used as-is, no
  // clock-based or goal-based drift applied.
  const factor = 1;

  let targetCalories = baseline.calories * factor;

  // ── F. HARD CAPS ─────────────────────────────────────────────────────
  const { min: mealMin, max: mealMax } = getMealCaps(goalType, dailyCalories);
  // profileCap = dailyCalories; HARD_CAP_KCAL already baked into getMealCaps.
  targetCalories = Math.max(mealMin, Math.min(targetCalories, mealMax));

  // Scale carbs/fat proportionally; protein is bounded from below.
  const calorieRatio = baseline.calories > 0 ? targetCalories / baseline.calories : 1;
  const baselineProtein = baseline.proteinG;

  let targetProtein: number;
  if (mode === "safe") {
    // Safe mode: protein locked to baseline, never scales up or down.
    targetProtein = baselineProtein;
  } else {
    // Coach mode: protein may scale up with calories, never below baseline.
    targetProtein = Math.max(clamp(baselineProtein * calorieRatio), baselineProtein);
  }

  let targetCarbs = clamp(baseline.carbsG * calorieRatio);
  let targetFat = clamp(baseline.fatG * calorieRatio);

  // ── G. LOW TARGET FALLBACK ───────────────────────────────────────────
  if (targetCalories < 200) {
    const rescuedCalories = Math.min(Math.max(200, baseline.calories * 0.35), mealMax);
    const rescueRatio = baseline.calories > 0 ? rescuedCalories / baseline.calories : 1;
    targetCalories = Math.round(rescuedCalories);
    targetProtein = Math.min(
      Math.max(clamp(baselineProtein * 0.7), clamp(baselineProtein * rescueRatio)),
      baselineProtein
    );
    targetCarbs = clamp(baseline.carbsG * rescueRatio);
    targetFat = clamp(baseline.fatG * rescueRatio);
  }

  // ── H. OUTPUT ────────────────────────────────────────────────────────
  return {
    label: baseline.label,
    calories: clamp(targetCalories),
    proteinG: clamp(targetProtein),
    carbsG: targetCarbs,
    fatG: targetFat,
    timingPurpose: baseline.timingPurpose,
  };
}
