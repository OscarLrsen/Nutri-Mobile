import type { ApiMeal } from "@/services/api/meals";
import type { ApiIngredient } from "@/services/api/ingredients";
import type { ApiMealDistribution } from "@/services/api/nutrition";
import type { ApiContainerType } from "@/services/api/containerTypes";

/**
 * Meal-level portion fit. Lives under anpassar/ because that was its first
 * consumer; personalizedMenu and heldagBuilder use it too.
 *
 * THIS NO LONGER MATCHES Nutri-Frontend's src/features/heldag/optimizer.ts.
 * The web still runs the original iterative fit (calorie pre-scale → per-role
 * damped scaling → kcal re-scale → fat→protein swap → convergence check).
 * That model treated kcal as a free knob, so it could hit the calorie target
 * with the wrong composition — e.g. a 1029 kcal / 50P / 133C target coming
 * back as 1013 kcal / 63P / 96C / 43F: calories right, 13 g too much protein
 * and 37 g too few carbs. Mobile deliberately diverges. Re-sync the web to
 * this model before assuming the two platforms agree on grams.
 *
 * The rule this encodes: kcal is not optimised for. It falls out of
 * 4·protein + 4·carbs + 9·fat. Priority is protein, then carbs, with kcal as a
 * read-out and fat best-effort. A single residual pass per macro, in order,
 * then stop — no global rescale, no swaps, no convergence loop.
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
  // Fruit is flavour, presentation and recipe identity — the apple in an apple
  // pie, the berries on a Cream of Rice. It is NOT a carb source to inflate
  // until a carb target is met, so it holds its recipe grams. Adjustable carbs
  // are the bases: rice, sweet potato, quinoa, potato, oats, rice flour.
  Frukt: "fixed",
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

type MacroKey = "proteinPerG" | "carbsPerG" | "fatPerG";

/**
 * One residual pass over a single role.
 *
 * Everything outside the role is a constant — its real macro contribution is
 * counted first, because "fixed" means fixed in grams, not nutritionally
 * invisible: keso carries protein, seeds carry fat, honey carries carbs.
 * Whatever the target still needs after those constants is what the role has
 * to deliver, so the free members scale by residual / current, which keeps
 * their recipe ratios and leaves the dish looking like itself.
 *
 * Members that would leave their own min/max are pinned exactly to the bound
 * and drop out of the free set; the residual is then recomputed against them
 * as constants too and redistributed over whoever is still free. That repeats
 * until nothing new clamps or nobody is free — at most once per member, so it
 * terminates. It is redistribution INSIDE one role, not a convergence loop:
 * no kcal iteration, no damping, no step cap, no cross-role compensation.
 */
function residualPass(
  work: WorkItem[],
  amounts: number[],
  role: MacroRole,
  macro: MacroKey,
  targetTotal: number
): void {
  const roleIdx = work.map((_, i) => i).filter((i) => work[i].role === role);
  if (roleIdx.length === 0 || targetTotal <= 0) return;

  const outsideRole = work.reduce(
    (sum, w, i) => (w.role === role ? sum : sum + amounts[i] * w[macro]),
    0
  );

  const free = new Set(roleIdx);
  while (free.size > 0) {
    const fromClamped = roleIdx
      .filter((i) => !free.has(i))
      .reduce((sum, i) => sum + amounts[i] * work[i][macro], 0);
    const fromFree = [...free].reduce((sum, i) => sum + amounts[i] * work[i][macro], 0);
    // Nobody still free carries this macro — nothing left to steer with.
    if (fromFree <= 0) return;

    // A negative residual means the constants already overshoot on their own.
    // Then the free members scale toward zero and land on their mins — we do
    // not "fix" the overshoot by inflating some other macro.
    const scale = Math.max(0, (targetTotal - outsideRole - fromClamped) / fromFree);

    let newlyClamped = false;
    for (const i of [...free]) {
      const desired = amounts[i] * scale;
      const bounded = Math.max(work[i].minG, Math.min(work[i].maxG, desired));
      if (bounded !== desired) {
        free.delete(i);
        newlyClamped = true;
      }
      amounts[i] = bounded;
    }
    // The scale applied cleanly, so the residual is met exactly. Done.
    if (!newlyClamped) return;
  }
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

  // 1. Start from the recipe, inside every ingredient's own limits.
  for (let i = 0; i < work.length; i++) {
    amounts[i] = Math.max(work[i].minG, Math.min(work[i].maxG, amounts[i]));
  }

  // 2–3. Fixed (and fat) ingredients stay on their recipe grams and count as
  //      real contributions; the protein role covers what protein is left.
  residualPass(work, amounts, "protein", "proteinPerG", target.proteinG);

  // 4. Same for the carb base. If it saturates, it saturates — the shortfall
  //    is NOT made up with extra protein or fat.
  residualPass(work, amounts, "carb", "carbsPerG", target.carbsG);

  // 5. The carb base carries some protein of its own, so one short
  //    stabilising protein pass. Not a new loop.
  residualPass(work, amounts, "protein", "proteinPerG", target.proteinG);

  // 6. Stop. No global kcal rescale, no fat→protein swap, no convergence
  //    loop — kcal is whatever these grams add up to.
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
