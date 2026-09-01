import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { getIngredients, type ApiIngredient } from "@/services/api/ingredients";
import { getContainerTypes, type ApiContainerType } from "@/services/api/containerTypes";
import { calculateCustomMeal, type CustomMealCalculateResponse } from "@/services/api/customMeal";
import type { ApiMeal } from "@/services/api/meals";
import type { ApiMealDistribution } from "@/services/api/nutrition";
import {
  isProfileGapError,
  useTodayNutritionQuery,
  useTodayDayPlanQuery,
  useRemainingTodayQuery,
} from "@/services/api/nutritionQueries";
import { buildNutriAdaptiveTarget } from "@/features/anpassar/buildNutriAdaptiveTarget";
import {
  optimizeIngredients,
  pickContainerId,
  type OptIngredient,
  type WizardSlot,
  SLOT_TO_MEAL_TIME_TAG,
} from "@/features/anpassar/optimizer";
import { mapGoalType } from "@/features/anpassar/nutriAnpassarTypes";
import { savedPlanTargets } from "@/features/dayplan/dayPlanSlots";


/**
 * The ordinary menu, personally computed — the REAL Nutri Anpassar engine
 * applied to every regular meal card.
 *
 * WHY THIS EXISTS. A previous release hid the separate "Anpassa en måltid"
 * entrance and put the customer's name on static meals — but the meals
 * themselves kept the recipe's default grams and the static base price.
 * That was presentation, not personalization. This module moves the actual
 * engine into the menu:
 *
 *  - the per-slot TARGET comes from the same pipeline Anpassar used:
 *    backend /nutrition-profile/today + /remaining-today + saved day plan
 *    → buildNutriAdaptiveTarget (verbatim web-port, untouched),
 *  - the INGREDIENT GRAMS come from the same optimizer (verbatim web-port,
 *    untouched — no new simplified math),
 *  - NUTRITION and PRICE come from the backend:
 *    POST /api/custom-meal/calculate is the single authority (öre-precise,
 *    ingredient sell prices + container cost + minimum floor). The client
 *    never invents a number — it presents the server result.
 *
 * NO SIZE MULTIPLIER ON THE TARGET. The slot target IS the target.
 * An earlier release scaled it by the M/L macro multiplier (M=1.0, L=1.2)
 * before optimizing, which meant a card showing "L" silently asked the
 * optimizer for 120% of the customer's own planned meal — a Lunch target of
 * 1145 kcal became a 1374 kcal recommendation while Home still promised
 * 1145. Personalization and portion sizing are two different products; this
 * module now does only the first, exactly as Anpassar always did (1.0×).
 *
 * `sizeId` is therefore no longer part of the computation. It is kept in the
 * signature so both call sites (which ask for "medium" and "large" to decide
 * whether L is a real choice) resolve to ONE shared cache row: the two
 * results are then identical by construction, the existing
 * arePersonalSizesEquivalent rule sees that, and the L button hides itself.
 * That is the same mechanism this codebase already used for saturated
 * recipes — no second, competing way to hide a size.
 *
 * THE TARGET IS THE ONE THE CUSTOMER WAS SHOWN. `todayMeals` comes from
 * savedPlanTargets() — the same derivation Home's HomeDayPlan and the menu's
 * SlotTargetBanner render from — and the slot may be passed in by the caller
 * so a tap on "Middag" at 12:00 optimizes against Middag, not against
 * whatever the clock would have guessed.
 *
 * CACHE KEYS carry the user id AND a stamp of the target, so:
 *  - two users on one device can never see each other's numbers,
 *  - any profile/goal/override change flows through the shared ["nutrition"]
 *    queries, changes the target, and thereby keys fresh computations —
 *    stale personal data is never re-used for a changed profile.
 */

export type PersonalizedMealData = {
  ingredients: OptIngredient[];
  containerTypeId: string;
  calc: CustomMealCalculateResponse;
  /** Reconciliation term so the cart's basePrice×1.0 + surcharge equals the
   * server's totalPriceOre — the exact contract the Anpassar handoff used.
   * The server recomputes the price at order time either way. */
  surchargeKr: number;
  slot: WizardSlot;
};

export type PersonalizedMealState =
  /** Not applicable: logged out, fixed portion, or nothing optimizable. The
   * static price IS the truth for these — showing it is honest. */
  | { status: "off" }
  /** Profile incomplete — never fake personal numbers; the menu's existing
   * profile-gap CTA asks the customer to finish onboarding. */
  | { status: "incomplete" }
  | { status: "loading" }
  /** The backend calculation failed — a controlled error, surfaced beside
   * the ordinary price so the customer is never silently shown a static
   * price as if it were personal. */
  | { status: "error" }
  | { status: "ready"; data: PersonalizedMealData };

const TAG_TO_SLOT: Record<string, WizardSlot> = Object.fromEntries(
  Object.entries(SLOT_TO_MEAL_TIME_TAG).map(([slot, tag]) => [tag, slot as WizardSlot]),
) as Record<string, WizardSlot>;

/** Which slot a meal belongs to for target purposes: the tag matching the
 * current daypart wins when a meal carries several. */
export function slotForMeal(meal: ApiMeal, nowHour: number): WizardSlot | null {
  const slots = meal.mealTimeTags
    .map((tag) => TAG_TO_SLOT[tag])
    .filter((slot): slot is WizardSlot => slot !== undefined);
  if (slots.length === 0) return null;
  if (slots.length === 1) return slots[0];

  const preferred: WizardSlot = nowHour < 10 ? "Frukost" : nowHour < 15 ? "Lunch" : "Middag";
  return slots.includes(preferred) ? preferred : slots[0];
}

/** Shared static libraries — one cache entry serves every card. */
function useIngredientLibraryQuery() {
  return useQuery({
    queryKey: ["ingredients"],
    queryFn: getIngredients,
    staleTime: 5 * 60_000,
  });
}

function useContainerTypesQuery() {
  return useQuery({
    queryKey: ["container-types"],
    queryFn: getContainerTypes,
    staleTime: 5 * 60_000,
  });
}

/**
 * The personally computed version of one meal, against the customer's own
 * slot target — no size scaling of any kind.
 *
 * Safe to call from every card: the heavy inputs are shared React Query
 * entries, and the per-meal computation is itself cached under a key that
 * includes user and target.
 *
 * @param sizeId  Retained for call-site compatibility only — see the module
 *   comment. It deliberately does NOT influence the target or the cache key.
 * @param slotOverride  The day-plan slot the customer navigated from, when
 *   the caller knows it. Without it the slot is inferred from the meal's
 *   tags and the clock, which cannot tell Lunch from Middag at midday.
 */
export function usePersonalizedMeal(
  meal: ApiMeal | null | undefined,
  sizeId: string,
  slotOverride: WizardSlot | null = null,
): PersonalizedMealState {
  void sizeId;
  const { user } = useAuth();
  const todayQuery = useTodayNutritionQuery();
  const dayPlanQuery = useTodayDayPlanQuery();
  const remainingQuery = useRemainingTodayQuery();
  const ingredientsQuery = useIngredientLibraryQuery();
  const containersQuery = useContainerTypesQuery();

  const nowHour = new Date().getHours();
  // The navigated slot wins: it is what Home showed and what
  // SlotTargetBanner is displaying. The tag/clock inference is the fallback
  // for screens reached without slot context (deep link, back-navigation).
  const slot = meal ? (slotOverride ?? slotForMeal(meal, nowHour)) : null;

  const applicable =
    !!user &&
    !!meal &&
    meal.portionMode !== "fixed" &&
    slot !== null &&
    meal.ingredients.some((ing) => ing.ingredientId);

  const today = todayQuery.data;
  const remaining = remainingQuery.data;

  const profileGap =
    (todayQuery.isError && isProfileGapError(todayQuery.error)) ||
    (today !== undefined && today.meals.length === 0);

  // The saved day plan wins over the auto-calculated day — the exact rule
  // the Anpassar wizard applies.
  //
  // Read through savedPlanTargets, NOT off the stored rows: in 3-meal mode
  // the snack is dropped and its calories are scaled back into the three
  // main meals, so the stored row and the row Home/SlotTargetBanner DISPLAY
  // are deliberately different numbers. Optimizing against the stored row
  // would tailor the meal to a target the customer was never shown — the
  // same class of bug mealRecommendation.ts already fixed for size picking.
  const savedVisible = savedPlanTargets(dayPlanQuery.data);
  const effectiveMeals: ApiMealDistribution[] =
    today && savedVisible.length > 0
      ? savedVisible.map((m) => ({
          ...m,
          timingPurpose: today.meals.find((t) => t.label === m.label)?.timingPurpose ?? "",
        }))
      : (today?.meals ?? []);

  const target =
    applicable && today && remaining && effectiveMeals.length > 0
      ? buildNutriAdaptiveTarget({
          selectedSlot: slot!,
          nowHour,
          goalType: mapGoalType(today.primaryGoal),
          todayMeals: effectiveMeals,
          remaining: remaining.remainingToday,
          consumedToday: remaining.consumedToday,
          dailyCalories: today.adjustedTarget.calories,
        })
      : null;

  const targetStamp = target
    ? `${slot}:${target.calories}:${target.proteinG}:${target.carbsG}:${target.fatG}`
    : null;

  const personalQuery = useQuery({
    // User id + target stamp + meal. NO sizeId: the size no longer changes
    // the computation, so both size call sites share this one row — one
    // calculate request per card instead of two identical ones.
    queryKey: ["personal-meal", user?.id ?? null, targetStamp, meal?.id ?? null],
    enabled:
      applicable &&
      !profileGap &&
      target !== null &&
      ingredientsQuery.data !== undefined &&
      containersQuery.data !== undefined,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PersonalizedMealData | null> => {
      const library = ingredientsQuery.data as ApiIngredient[];
      const containers = containersQuery.data as ApiContainerType[];

      // The SAME engine Anpassar used — grams from the ported optimizer,
      // nothing invented here.
      const ingredients = optimizeIngredients(meal!.ingredients, library, target!);
      if (ingredients.length === 0) return null;

      const totalWeight = ingredients.reduce((sum, ing) => sum + ing.amountG, 0);
      const containerTypeId = pickContainerId(containers, totalWeight);
      if (!containerTypeId) return null;

      // Backend authority for nutrition and price — öre-precise, container
      // cost and minimum floor included.
      const calc = await calculateCustomMeal({
        containerTypeId,
        items: ingredients.map((ing) => ({ ingredientId: ing.ingredientId, grams: ing.amountG })),
      });

      return {
        ingredients,
        containerTypeId,
        calc,
        surchargeKr: Math.round(calc.totalPriceOre / 100) - meal!.basePrice,
        slot: slot!,
      };
    },
  });

  if (!applicable) return { status: "off" };
  if (profileGap) return { status: "incomplete" };

  const inputsLoading =
    todayQuery.isLoading ||
    remainingQuery.isLoading ||
    ingredientsQuery.isLoading ||
    containersQuery.isLoading;

  if (personalQuery.data) return { status: "ready", data: personalQuery.data };
  if (personalQuery.data === null) return { status: "off" };
  if (inputsLoading || personalQuery.isLoading || personalQuery.isPending) {
    // Inputs that failed outright (not a profile gap) are an error, not an
    // endless spinner.
    if (todayQuery.isError || remainingQuery.isError || ingredientsQuery.isError || containersQuery.isError) {
      return { status: "error" };
    }
    return { status: "loading" };
  }
  return { status: "error" };
}
