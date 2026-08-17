/**
 * Are two personally computed portions THE SAME portion?
 *
 * WHY THIS EXISTS. The menu offers M and L, and each runs the same
 * optimize→calculate pipeline against a size-scaled target. When every
 * scalable ingredient is already saturated at its MaxAmountG for M, scaling
 * the target by 1.2 changes nothing — the optimizer returns the exact same
 * grams, so weight, macros and price are identical too. Presenting that as
 * two different purchase options sells the customer an upgrade that does not
 * exist. These helpers are the single definition of "identical" so MealCard
 * and MealDetailScreen can never disagree about it.
 *
 * THE RULE IS THE RECIPE, NOT THE TOTALS. Two portions are equivalent only
 * when they contain exactly the same ingredients at exactly the same grams,
 * regardless of array order. Totals are deliberately NOT compared:
 *  - equal totalPriceOre does NOT mean equal portions — the minimum price
 *    floor can price two genuinely different portions identically, and the
 *    customer still gets more food in one of them;
 *  - equal weight/calories does not either — two different gram
 *    distributions can coincide on any aggregate.
 */

import type { PersonalizedMealState } from "./personalizedMenu";

/** The minimal shape compared — structurally satisfied by OptIngredient. */
export type PortionIngredient = { ingredientId: string; amountG: number };
export type PortionLike = { ingredients: PortionIngredient[] };

export function areCustomMealPortionsEquivalent(a: PortionLike, b: PortionLike): boolean {
  if (a.ingredients.length !== b.ingredients.length) return false;

  // ingredientId → grams, order-independent. Duplicate ids cannot occur in an
  // optimizer result (one row per library ingredient), but summing makes the
  // comparison correct even if one ever did.
  const gramsById = new Map<string, number>();
  for (const ing of a.ingredients) {
    gramsById.set(ing.ingredientId, (gramsById.get(ing.ingredientId) ?? 0) + ing.amountG);
  }

  const seen = new Set<string>();
  for (const ing of b.ingredients) {
    if (seen.has(ing.ingredientId)) {
      // b repeats an id that a listed once — lengths matched, so recipes differ.
      return false;
    }
    seen.add(ing.ingredientId);
    if (gramsById.get(ing.ingredientId) !== ing.amountG) return false;
  }
  return gramsById.size === seen.size;
}

/**
 * The screen-level question: with both personal sizes computed, is L the same
 * portion as M? False whenever either side is not ready — an option is only
 * hidden on CONFIRMED equivalence, never on a guess while one size loads.
 */
export function arePersonalSizesEquivalent(
  medium: PersonalizedMealState,
  large: PersonalizedMealState,
): boolean {
  if (medium.status !== "ready" || large.status !== "ready") return false;
  return areCustomMealPortionsEquivalent(medium.data, large.data);
}
