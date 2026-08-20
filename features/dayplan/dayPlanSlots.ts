import type { ApiMealDistribution } from "@/services/api/nutrition";

/**
 * The day plan's slot arithmetic and palette, lifted out of PlanDayScreen so
 * Home and the planner render the SAME thing rather than two drifting copies.
 * Every rule here is the one the planner already shipped, moved verbatim —
 * this is a relocation, not a new day-plan engine.
 */

export const DISPLAY_ORDER: Record<string, number> = {
  Frukost: 0,
  "Mellanmål": 1,
  Lunch: 2,
  Middag: 3,
};

export const SLOT_COLORS: Record<string, string> = {
  Frukost: "#FF8A3D",
  Lunch: "#5FA0FF",
  Middag: "#F0C14B",
  "Mellanmål": "#7FC97F",
};

const SLOT_COLOR_FALLBACK = ["#FF8A3D", "#5FA0FF", "#F0C14B", "#7FC97F"];

export function slotColor(label: string, index: number): string {
  return SLOT_COLORS[label] ?? SLOT_COLOR_FALLBACK[index % SLOT_COLOR_FALLBACK.length];
}

export function orderForDisplay(meals: ApiMealDistribution[]): ApiMealDistribution[] {
  return [...meals].sort((a, b) => (DISPLAY_ORDER[a.label] ?? 99) - (DISPLAY_ORDER[b.label] ?? 99));
}

/**
 * The slots a 3- or 4-meal view shows. In 4-meal mode every slot is shown as
 * it stands. In 3-meal mode the snack is dropped and its calories are scaled
 * back into the three main meals, so the day still adds up to the same total
 * — the web's rule, ported verbatim by the planner and now shared.
 */
export function visibleSlotsFor(
  mealTab: "3" | "4",
  meals: ApiMealDistribution[]
): ApiMealDistribution[] {
  if (mealTab === "4" || meals.length < 4) return orderForDisplay(meals);

  const totalCals = meals.reduce((s, m) => s + m.calories, 0);
  const first3 = meals[0].calories + meals[1].calories + meals[2].calories;
  if (first3 === 0) return meals.slice(0, 3);

  const scale = totalCals / first3;
  return meals.slice(0, 3).map((m) => ({
    ...m,
    calories: Math.round(m.calories * scale),
    proteinG: Math.round(m.proteinG * scale),
    carbsG: Math.round(m.carbsG * scale),
    fatG: Math.round(m.fatG * scale),
  }));
}
