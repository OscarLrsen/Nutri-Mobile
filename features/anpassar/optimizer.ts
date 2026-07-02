import type { ApiMeal } from "@/services/api/meals";
import type { ApiIngredient } from "@/services/api/ingredients";
import type { ApiMealDistribution } from "@/services/api/nutrition";
import type { ApiContainerType } from "@/services/api/containerTypes";

/**
 * Verbatim port of Nutri-Frontend's src/features/heldag/optimizer.ts (the
 * web keeps it under heldag/ because "Sätt upp din dag" shares it; on mobile
 * it lives with anpassar since that's its only consumer so far). The
 * iterative macro-fit (calorie pre-scale → per-role damped scaling →
 * re-scale → fat→protein swap → convergence check) must produce identical
 * gram amounts on both platforms — do not "improve" it here.
 */

export type WizardSlot = "Frukost" | "Lunch" | "Middag" | "Mellanmål";

export const SLOT_TO_MEAL_TIME_TAG: Record<WizardSlot, string> = {
  Frukost: "Breakfast",
  Lunch: "Lunch",
  Middag: "Dinner",
  Mellanmål: "Snack",
};

type MacroRole = "protein" | "carb" | "fat" | "fixed";
const CATEGORY_ROLE: Record<string, MacroRole> = {
  Protein: "protein",
  Baser: "carb",
  Frukt: "carb",
  Kolhydrater: "carb",
  Grönsaker: "fixed",
  Mejeri: "fixed",
  Såser: "fixed",
  Toppings: "fixed",
  Fetter: "fat",
};

export type OptIngredient = { ingredientId: string; name: string; amountG: number };

type WorkItem = {
  ingredientId: string;
  name: string;
  proteinPerG: number;
  carbsPerG: number;
  fatPerG: number;
  role: MacroRole;
  minG: number;
  maxG: number;
};

const ITERATIONS = 3;
const DAMPING = 0.7;
const MAX_DELTA_G = 12;
const FAT_REDUCE_MAX_G = 12;

function kcalFromAmounts(work: WorkItem[], amounts: number[]): number {
  return work.reduce(
    (sum, w, i) => sum + amounts[i] * (w.proteinPerG * 4 + w.carbsPerG * 4 + w.fatPerG * 9),
    0
  );
}

export function optimizeIngredients(
  mealIngredients: ApiMeal["ingredients"],
  library: ApiIngredient[],
  target: ApiMealDistribution
): OptIngredient[] {
  const work: WorkItem[] = [];
  const amounts: number[] = [];

  for (const ing of mealIngredients) {
    if (!ing.ingredientId) continue;
    const lib = library.find((l) => l.id === ing.ingredientId);
    if (!lib) continue;
    work.push({
      ingredientId: ing.ingredientId,
      name: ing.name,
      proteinPerG: lib.proteinG100g / 100,
      carbsPerG: lib.carbsG100g / 100,
      fatPerG: lib.fatG100g / 100,
      role: CATEGORY_ROLE[lib.category] ?? "fixed",
      minG: lib.minAmountG != null ? Number(lib.minAmountG) : 0,
      maxG: lib.maxAmountG != null ? Number(lib.maxAmountG) : 500,
    });
    amounts.push(ing.amountG);
  }

  if (work.length === 0) return [];

  const currentKcal = kcalFromAmounts(work, amounts);
  if (currentKcal > 0 && target.calories > 0) {
    const calScale = target.calories / currentKcal;
    for (let i = 0; i < work.length; i++) {
      if (work[i].role === "fixed") continue;
      amounts[i] = Math.max(work[i].minG, Math.min(work[i].maxG, amounts[i] * calScale));
    }
  }

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (const role of ["protein", "carb", "fat"] as const) {
      const indices = work.map((w, i) => ({ w, i })).filter(({ w }) => w.role === role);
      if (indices.length === 0) continue;

      const targetG =
        role === "protein" ? target.proteinG : role === "carb" ? target.carbsG : target.fatG;

      const currentFromRole = indices.reduce((sum, { w, i }) => {
        const perG =
          role === "protein" ? w.proteinPerG : role === "carb" ? w.carbsPerG : w.fatPerG;
        return sum + amounts[i] * perG;
      }, 0);

      if (currentFromRole <= 0 || targetG <= 0) continue;

      const scale = targetG / currentFromRole;
      const dampedScale = 1 + (scale - 1) * DAMPING;

      for (const { w, i } of indices) {
        const desired = Math.max(w.minG, Math.min(w.maxG, amounts[i] * dampedScale));
        const delta = Math.max(-MAX_DELTA_G, Math.min(MAX_DELTA_G, desired - amounts[i]));
        amounts[i] = amounts[i] + delta;
      }
    }

    const postIterKcal = kcalFromAmounts(work, amounts);
    if (postIterKcal > 0 && target.calories > 0) {
      const reScale = target.calories / postIterKcal;
      for (let i = 0; i < work.length; i++) {
        if (work[i].role === "fixed") continue;
        amounts[i] = Math.max(work[i].minG, Math.min(work[i].maxG, amounts[i] * reScale));
      }
    }

    const currentProtein = work.reduce((sum, w, i) => sum + amounts[i] * w.proteinPerG, 0);
    if (currentProtein < target.proteinG) {
      const fatIndices = work.map((w, i) => ({ w, i })).filter(({ w }) => w.role === "fat");
      const proteinIndices = work.map((w, i) => ({ w, i })).filter(({ w }) => w.role === "protein");

      if (fatIndices.length > 0 && proteinIndices.length > 0) {
        let freedKcal = 0;

        for (const { w, i } of fatIndices) {
          const reduction = Math.min(FAT_REDUCE_MAX_G, amounts[i] - w.minG);
          if (reduction <= 0) continue;
          const kcalPerG = w.proteinPerG * 4 + w.carbsPerG * 4 + w.fatPerG * 9;
          freedKcal += reduction * kcalPerG;
          amounts[i] -= reduction;
        }

        if (freedKcal > 0) {
          const totalProteinKcalPerG = proteinIndices.reduce(
            (sum, { w }) => sum + (w.proteinPerG * 4 + w.carbsPerG * 4 + w.fatPerG * 9),
            0
          );

          for (const { w, i } of proteinIndices) {
            if (totalProteinKcalPerG <= 0) break;
            const kcalPerG = w.proteinPerG * 4 + w.carbsPerG * 4 + w.fatPerG * 9;
            const share = kcalPerG / totalProteinKcalPerG;
            const addG = (freedKcal * share) / kcalPerG;
            amounts[i] = Math.min(w.maxG, amounts[i] + addG);
          }
        }

        const postSwapKcal = kcalFromAmounts(work, amounts);
        if (postSwapKcal > 0 && target.calories > 0) {
          const swapReScale = target.calories / postSwapKcal;
          for (let i = 0; i < work.length; i++) {
            if (work[i].role === "fixed") continue;
            amounts[i] = Math.max(work[i].minG, Math.min(work[i].maxG, amounts[i] * swapReScale));
          }
        }
      }
    }

    const finalProtein = work.reduce((sum, w, i) => sum + amounts[i] * w.proteinPerG, 0);
    const finalKcal = kcalFromAmounts(work, amounts);
    const proteinOk = Math.abs(finalProtein - target.proteinG) <= 3;
    const caloriesOk =
      target.calories > 0 && Math.abs(finalKcal - target.calories) / target.calories <= 0.03;
    if (proteinOk && caloriesOk) break;
  }

  return work
    .map((w, i) => ({
      ingredientId: w.ingredientId,
      name: w.name,
      amountG: Math.round(amounts[i]),
    }))
    .filter((i) => i.amountG > 0);
}

export function pickContainerId(containers: ApiContainerType[], totalWeightGrams: number): string {
  const active = containers.filter((c) => c.isActive);
  if (active.length === 0) return "";
  const sorted = [...active].sort((a, b) => a.maxWeightGrams - b.maxWeightGrams);
  return (sorted.find((c) => c.maxWeightGrams >= totalWeightGrams) ?? sorted[sorted.length - 1]).id;
}
