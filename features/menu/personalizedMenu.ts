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
import { MEAL_SIZES } from "@/utils/pricing";


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
 * M/L: Anpassar itself always tailored at 1.0×. The menu keeps M and L by
 * scaling the personal TARGET with the established size multipliers
 * (utils/pricing MEAL_SIZES ↔ backend SizeHelper: M=1.0, L=1.2) and
 * re-running the SAME optimize→calculate pipeline per size — so grams,
 * macros and price all come from the server for both sizes, never from a
 * local UI multiplication.
 *
 * CACHE KEYS carry the user id AND a stamp of the scaled target, so:
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

function scaleTarget(target: ApiMealDistribution, multiplier: number): ApiMealDistribution {
  if (multiplier === 1) return target;
  return {
    ...target,
    calories: Math.round(target.calories * multiplier),
    proteinG: Math.round(target.proteinG * multiplier),
    carbsG: Math.round(target.carbsG * multiplier),
    fatG: Math.round(target.fatG * multiplier),
  };
}

/**
 * The personally computed version of one meal at one size.
 *
 * Safe to call from every card: the heavy inputs are shared React Query
 * entries, and the per-meal computation is itself cached under a key that
 * includes user, target and size.
 */
export function usePersonalizedMeal(
  meal: ApiMeal | null | undefined,
  sizeId: string,
): PersonalizedMealState {
  const { user } = useAuth();
  const todayQuery = useTodayNutritionQuery();
  const dayPlanQuery = useTodayDayPlanQuery();
  const remainingQuery = useRemainingTodayQuery();
  const ingredientsQuery = useIngredientLibraryQuery();
  const containersQuery = useContainerTypesQuery();

  const nowHour = new Date().getHours();
  const slot = meal ? slotForMeal(meal, nowHour) : null;

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
  const effectiveMeals: ApiMealDistribution[] =
    today && dayPlanQuery.data?.meals?.length
      ? dayPlanQuery.data.meals.map((m) => ({
          ...m,
          timingPurpose: today.meals.find((t) => t.label === m.label)?.timingPurpose ?? "",
        }))
      : (today?.meals ?? []);

  const sizeMultiplier = MEAL_SIZES.find((s) => s.id === sizeId)?.macroMultiplier ?? 1;

  const target =
    applicable && today && remaining && effectiveMeals.length > 0
      ? scaleTarget(
          buildNutriAdaptiveTarget({
            selectedSlot: slot!,
            nowHour,
            goalType: mapGoalType(today.primaryGoal),
            todayMeals: effectiveMeals,
            remaining: remaining.remainingToday,
            consumedToday: remaining.consumedToday,
            dailyCalories: today.adjustedTarget.calories,
          }),
          sizeMultiplier,
        )
      : null;

  const targetStamp = target
    ? `${slot}:${target.calories}:${target.proteinG}:${target.carbsG}:${target.fatG}`
    : null;

  const personalQuery = useQuery({
    // User id + target stamp + meal + size: a profile change produces a new
    // stamp (fresh computation), and another account can never hit this
    // cache entry.
    queryKey: ["personal-meal", user?.id ?? null, targetStamp, meal?.id ?? null, sizeId],
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
