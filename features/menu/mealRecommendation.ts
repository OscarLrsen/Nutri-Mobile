import type { ApiMeal } from "@/services/api/meals";
import type { ApiMealDistribution, ApiTodayNutrition } from "@/services/api/nutrition";
import type { SavedDayPlanResponse } from "@/services/api/dayPlan";
import type { AppLanguage } from "@/i18n/languages";
import { CUSTOMER_SIZE_OPTIONS } from "@/utils/pricing";
import {
  FALLBACK_SHARE_FOR_SLOT,
  getStockholmHour,
  matchSlotLabel,
} from "@/features/heldag/heldagBuilder";
import type { WizardSlot } from "@/features/anpassar/optimizer";
import { savedPlanTargets } from "@/features/dayplan/dayPlanSlots";

/**
 * Personal portion recommendation for menu cards (patch 12).
 *
 * PRESENTATION-ONLY SELECTION BETWEEN BACKEND-DEFINED MEAL SIZES.
 * Daily targets, meal nutrition, prices and size multipliers remain
 * server-authoritative. This module NEVER:
 * - computes a new daily target, BMR or energy need,
 * - defines new portion limits or sizes,
 * - replaces or mutates the server-saved day plan,
 * - sends any client-computed price to the backend,
 * - changes ingredient grams on a regular menu meal.
 * The only local decision is WHICH of the backend's already-defined size
 * options (the MEAL_SIZES contract mirrored from SizeHelper.cs) lies
 * closest to the server's target for the current slot.
 *
 * Target priority (patch 12 final check):
 * 1. the user's SAVED day plan (GET /day-plan/today — server source of
 *    truth; the copy "your goal and today's plan" must reflect a manual
 *    plan when one exists),
 * 2. otherwise the backend's automatic distribution
 *    (/nutrition-profile/today `meals[]`),
 * 3. otherwise the Heldag fallback share of the daily target,
 * 4. no data at all → null → the card renders without a recommendation.
 * Both sources come from ONE shared React Query row each — never a call
 * per card.
 *
 * The scoring rule is the Heldag builder's, verbatim
 * (|Δkcal| + |Δprotein|·4). Fixed-portion meals get no size
 * recommendation (nothing to choose); errors never block ordering.
 */

export interface MealRecommendation {
  /** Recommended CUSTOMER size ("medium" | "large"). */
  sizeId: string;
  /** The backend slot the target came from (for a11y/debug copy). */
  slot: WizardSlot;
}

/** Which slot a menu category speaks to. Huvudmåltider follows the Heldag
 * serving windows (Stockholm time): lunch until 15, dinner after. */
export function slotForCategory(
  categoryId: "frukost" | "huvudmaltider" | "mellanmal",
  language: AppLanguage
): WizardSlot {
  if (categoryId === "frukost") return "Frukost";
  if (categoryId === "mellanmal") return "Mellanmål";
  return getStockholmHour(language) < 15 ? "Lunch" : "Middag";
}

export type MenuCategoryId = "frukost" | "huvudmaltider" | "mellanmal";

/**
 * The inverse: which menu category a day-plan slot lands in.
 *
 * NOTE THAT LUNCH AND MIDDAG SHARE ONE CATEGORY. The menu has five chips
 * (frukost, huvudmaltider, mellanmal, shakes, dryck) and no separate lunch
 * or dinner tab — both are Huvudmåltider. So opening the menu from a slot
 * has to carry the SLOT as well as the category, or a tap on Middag at
 * 12:00 would silently be served lunch portions by the clock rule above.
 */
export function categoryForSlot(slot: WizardSlot): MenuCategoryId {
  if (slot === "Frukost") return "frukost";
  if (slot === "Mellanmål") return "mellanmal";
  return "huvudmaltider";
}

/** Narrows an arbitrary string (a navigation param) to a real slot. */
export function parseSlot(value: string | undefined | null): WizardSlot | null {
  return value === "Frukost" || value === "Lunch" || value === "Middag" || value === "Mellanmål"
    ? value
    : null;
}

/**
 * The slot a MEAL belongs to, for screens that have a meal but no category
 * context — the detail route reached by a deep link or a back-navigation.
 * Same precedence the menu grouping uses: the Breakfast tag wins, then the
 * Mellanmål category, then the clock decides lunch vs dinner.
 */
export function slotForMeal(meal: ApiMeal, language: AppLanguage): WizardSlot {
  if (meal.mealTimeTags?.includes("Breakfast")) return "Frukost";
  if (meal.category === "Mellanmål") return "Mellanmål";
  return getStockholmHour(language) < 15 ? "Lunch" : "Middag";
}

/** The server's target for a slot, in priority order: the user's SAVED
 * day plan first (a valid slot row with calories > 0), then the backend's
 * automatic distribution, then the Heldag fallback share. Null without
 * any server data. */
export function slotTarget(
  today: ApiTodayNutrition | undefined,
  savedPlan: SavedDayPlanResponse | null | undefined,
  slot: WizardSlot
): ApiMealDistribution | null {
  // 1. Saved plan wins — it is the server-persisted, possibly manually
  //    edited plan the day planner wrote (and Nutri Anpassar reads).
  //
  //    ── THE SAME NUMBERS HOME SHOWS ──────────────────────────────────
  //    Read through visibleSlotsFor, which is what Home and the planner
  //    render from. It matters in 3-MEAL MODE: there the snack is dropped
  //    and its calories are scaled back into the three main meals, so the
  //    STORED row and the DISPLAYED row are deliberately different numbers.
  //    This function used to return the stored row while Home displayed the
  //    scaled one — 150 kcal apart on Lunch for a 2000 kcal plan — so the
  //    menu recommended a size against a target the customer had never been
  //    shown. One transformation, one set of numbers.
  const visible = savedPlanTargets(savedPlan);
  const savedSlot = visible.find((m) => m.calories > 0 && matchSlotLabel(slot, m.label));
  if (savedSlot) return savedSlot;

  // 2–3. Automatic distribution, then fallback share.
  if (!today) return null;
  const matched = today.meals.find((m) => matchSlotLabel(slot, m.label));
  if (matched) return matched;
  const share = FALLBACK_SHARE_FOR_SLOT[slot];
  const adj = today.adjustedTarget;
  return {
    label: slot,
    calories: Math.round(adj.calories * share),
    proteinG: Math.round(adj.proteinG * share),
    carbsG: Math.round(adj.carbsG * share),
    fatG: Math.round(adj.fatG * share),
    timingPurpose: "",
  };
}

/** Heldag's scoring rule, verbatim: |Δkcal| + |Δprotein|·4. */
function score(calories: number, proteinG: number, target: ApiMealDistribution): number {
  return Math.abs(calories - target.calories) + Math.abs(proteinG - target.proteinG) * 4;
}

export function recommendSize(
  meal: ApiMeal,
  target: ApiMealDistribution | null,
  slot: WizardSlot
): MealRecommendation | null {
  if (!target) return null;
  if (meal.portionMode === "fixed") return null; // nothing to choose

  let best: { sizeId: string; s: number } | null = null;
  for (const size of CUSTOMER_SIZE_OPTIONS) {
    const s = score(
      meal.macros.calories * size.macroMultiplier,
      meal.macros.proteinG * size.macroMultiplier,
      target
    );
    if (!best || s < best.s) best = { sizeId: size.id, s };
  }
  return best ? { sizeId: best.sizeId, slot } : null;
}
