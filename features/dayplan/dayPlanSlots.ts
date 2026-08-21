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

/** The slot editor's working copy — never the plan itself. */
export interface SlotDraft {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const EMPTY_DRAFT: SlotDraft = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/**
 * A fresh draft, seeded from the slot as it is stored RIGHT NOW.
 *
 * The one seeding rule, shared by the planner's "Ändra" button and by the
 * deep link that opens a slot straight from Home. Because every open goes
 * through here, an edit abandoned by tapping the backdrop can never come
 * back: the next open reads the plan, not the draft that was thrown away.
 * That is the whole mechanism by which unsaved changes are discarded —
 * nothing is undone, because nothing was written.
 */
export function draftFor(meal: ApiMealDistribution | undefined): SlotDraft {
  if (!meal) return EMPTY_DRAFT;
  return {
    calories: meal.calories,
    proteinG: meal.proteinG,
    carbsG: meal.carbsG,
    fatG: meal.fatG,
  };
}

/**
 * Whether a visible slot row may be edited in the current view.
 *
 * ONE definition, used by the planner's "Ändra" button and by the deep link
 * that opens a slot's editor straight from Home — they must agree, or a
 * customer could be sent to an editor that then refuses to exist.
 *
 * 3-meal mode with four stored meals is the exception: the rows there show
 * SCALED numbers (the snack's calories spread across the three main meals)
 * while the stored slot still holds the unscaled ones. Opening an editor on
 * a slot whose numbers differ from the row the customer just tapped would be
 * a lie about what is being changed, so the tab is switched first. This rule
 * predates the Home move and is kept exactly as it was.
 */
export function isSlotEditable(mealTab: "3" | "4", mealCount: number): boolean {
  return mealTab === "4" || mealCount < 4;
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
