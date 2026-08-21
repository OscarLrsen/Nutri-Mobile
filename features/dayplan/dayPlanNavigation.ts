import { categoryForSlot } from "@/features/menu/mealRecommendation";
import type { WizardSlot } from "@/features/anpassar/optimizer";

/**
 * WHERE A DAY-PLAN ROW CAN TAKE YOU. One definition, used by every caller.
 *
 * The row itself and its "Beställ" button do the SAME thing, and they do it
 * by calling the same function — because two places that navigate "to the
 * menu for this slot" will otherwise drift the first time either is touched,
 * and the way they drift is silent: Middag quietly served lunch portions.
 */

/** The planner, for the whole day rather than one slot. */
export const PLAN_DAY_ROUTE = "/planera-dagen" as const;

export interface MenuSlotTarget {
  pathname: "/(tabs)/meny";
  params: { category: string; slot: WizardSlot; navKey: string };
}

/**
 * The menu, opened on the category this slot belongs to and carrying the
 * slot itself.
 *
 * THE SLOT IS NOT REDUNDANT. Lunch and Middag share the Huvudmåltider chip —
 * the menu has no lunch tab and no dinner tab — so without it a tap on
 * Middag at 12:00 would be served lunch portions by the menu's clock rule,
 * and the M/L recommendation would be computed against the wrong target.
 *
 * `navKey` distinguishes two taps on the same slot. The menu applies an
 * incoming category through an effect keyed on the params, so without a
 * changing value a second tap is the same two params and the effect never
 * re-runs — leaving a chip the customer switched by hand in between, and a
 * tap that looks dead.
 */
export function menuHrefForSlot(slot: WizardSlot, now: number): MenuSlotTarget {
  return {
    pathname: "/(tabs)/meny",
    params: {
      category: categoryForSlot(slot),
      slot,
      navKey: String(now),
    },
  };
}
