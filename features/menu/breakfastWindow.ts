import type { ApiMeal } from "@/services/api/meals";
import { getStockholmHour } from "@/features/heldag/heldagBuilder";
import type { AppLanguage } from "@/i18n/languages";

/**
 * The breakfast serving window, MIRRORED from the server.
 *
 * BreakfastWindowRules.cs is the enforcement — it refuses the order with a
 * structured 409 whatever the device clock says. This module exists only so
 * the customer is told BEFORE tapping Add, instead of meeting a mysterious
 * error at checkout. It must never be the only thing standing between a
 * customer and a breakfast at midnight, and it is not.
 *
 * The bounds match the backend and the web (10:00 ≤ t < 11:00) so all three
 * describe the same window. Changing them here changes nothing that matters;
 * change BreakfastWindowRules.cs.
 */

export const BREAKFAST_HOURS = { startHour: 10, endHour: 11 } as const;

export const BREAKFAST_WINDOW_LABEL = "10:00–11:00";

const BREAKFAST_TAG = "Breakfast";

/** The same flag both menus group by — never the free-text category. */
export function isBreakfastMeal(meal: ApiMeal): boolean {
  return meal.mealTimeTags?.includes(BREAKFAST_TAG) ?? false;
}

/**
 * Whether breakfast can be ordered right now, by the device's idea of
 * Stockholm time. Advisory only — see the module note.
 */
export function isBreakfastOrderable(language: AppLanguage): boolean {
  const hour = getStockholmHour(language);
  return hour >= BREAKFAST_HOURS.startHour && hour < BREAKFAST_HOURS.endHour;
}

/** True when THIS meal is locked right now. */
export function isBreakfastLocked(meal: ApiMeal, language: AppLanguage): boolean {
  return isBreakfastMeal(meal) && !isBreakfastOrderable(language);
}
