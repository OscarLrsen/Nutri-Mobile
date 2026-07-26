import type { ApiMeal } from "@/services/api/meals";
import { LOCALE_BY_LANGUAGE } from "@/i18n/formatters";
import type { AppLanguage } from "@/i18n/languages";
import type { ApiIngredient } from "@/services/api/ingredients";
import type { ApiContainerType } from "@/services/api/containerTypes";
import type { ApiMealDistribution, ApiTodayNutrition } from "@/services/api/nutrition";
import {
  calculateCustomMeal,
  type CustomMealCalculateResponse,
} from "@/services/api/customMeal";
import {
  optimizeIngredients,
  pickContainerId,
  SLOT_TO_MEAL_TIME_TAG,
  type OptIngredient,
  type WizardSlot,
} from "@/features/anpassar/optimizer";

/**
 * Heldagsmåltid package builder — verbatim port of the module-level logic in
 * Nutri-Frontend's src/app/heldag/page.tsx (slot targets, availability
 * window, per-slot optimizer+calculate builders). The optimizer itself is
 * already the shared verbatim port in features/anpassar/optimizer.ts (the
 * web keeps it under features/heldag/ — same file, same math).
 *
 * Behavior must match the web exactly: same slot set (V1: Lunch, Mellanmål,
 * Middag — Frukost excluded), same fallback shares, same scoring
 * (|Δkcal| + |Δprotein|·4), same fixed-product snack handling, same
 * Stockholm 11–15 ordering window.
 *
 * One structural (not behavioral) deviation: the web repeats the container-
 * pick + calculate + surcharge block inside each of its three builders;
 * here it is factored into calculateResult(). Inputs/outputs per builder
 * are byte-identical to the web's. Error reasons are the web's translation
 * key suffixes ("noContainer" / "calculateMeal") mapped to sv copy by the
 * screen.
 */

// V1: Lunch, Mellanmål, Middag — Frukost excluded from package
export const SLOTS: WizardSlot[] = ["Lunch", "Mellanmål", "Middag"];

export const SLOT_SERVES: Record<WizardSlot, string> = {
  Frukost: "10–11",
  Lunch: "12–14",
  Middag: "17–21",
  Mellanmål: "när du vill",
};

const FALLBACK_SHARE: Record<WizardSlot, number> = {
  Frukost: 0.25,
  Lunch: 0.35,
  Middag: 0.35,
  Mellanmål: 0.2,
};

export type SlotResult =
  | {
      slot: WizardSlot;
      target: ApiMealDistribution;
      status: "ready";
      meal: ApiMeal;
      optimizedIngredients: OptIngredient[];
      calcResult: CustomMealCalculateResponse;
      customMacros: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };
      customIngredients: { ingredientId: string; name: string; amountG: number }[];
      containerTypeId: string;
      ingredientSurchargeKr: number;
    }
  | { slot: WizardSlot; target: ApiMealDistribution; status: "missing" }
  | { slot: WizardSlot; target: ApiMealDistribution; status: "error"; reason: "noContainer" | "calculateMeal" };

/* ── Stockholm time + availability ─────────────────────────── */

export function getStockholmHour(language: AppLanguage): number {
  const parts = new Intl.DateTimeFormat(LOCALE_BY_LANGUAGE[language], {
    hour: "2-digit",
    hour12: false,
    timeZone: "Europe/Stockholm",
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour");
  return h ? Number(h.value) : new Date().getHours();
}

export function isPackageAvailable(hour: number): boolean {
  return hour >= 11 && hour < 15;
}

export type PackageWindowState = "before" | "open" | "after";

export function getPackageWindowState(hour: number): PackageWindowState {
  if (hour < 11) return "before";
  if (hour < 15) return "open";
  return "after";
}

/* ── Slot target derivation ─────────────────────────────── */

function matchSlotLabel(slot: WizardSlot, label: string): boolean {
  const l = label.toLowerCase();
  switch (slot) {
    case "Frukost":
      return l.includes("frukost") || l.includes("breakfast");
    case "Lunch":
      return l.includes("lunch");
    case "Middag":
      return l.includes("middag") || l.includes("dinner");
    case "Mellanmål":
      return l.includes("mellanmål") || l.includes("snack");
  }
}

export function deriveTargets(today: ApiTodayNutrition): Record<WizardSlot, ApiMealDistribution> {
  const result = {} as Record<WizardSlot, ApiMealDistribution>;
  const adj = today.adjustedTarget;

  for (const slot of SLOTS) {
    const matched = today.meals.find((m) => matchSlotLabel(slot, m.label));
    if (matched) {
      result[slot] = matched;
      continue;
    }
    const share = FALLBACK_SHARE[slot];
    result[slot] = {
      label: slot,
      calories: Math.round(adj.calories * share),
      proteinG: Math.round(adj.proteinG * share),
      carbsG: Math.round(adj.carbsG * share),
      fatG: Math.round(adj.fatG * share),
      timingPurpose: "",
    };
  }
  return result;
}

/* ── Shared calculate step (identical across the web's three builders) ── */

async function calculateResult(
  slot: WizardSlot,
  target: ApiMealDistribution,
  meal: ApiMeal,
  ings: OptIngredient[],
  containers: ApiContainerType[]
): Promise<SlotResult> {
  const totalWeight = ings.reduce((s, i) => s + i.amountG, 0);
  const containerTypeId = pickContainerId(containers, totalWeight);
  if (!containerTypeId) return { slot, target, status: "error", reason: "noContainer" };

  try {
    const calcResult = await calculateCustomMeal({
      containerTypeId,
      items: ings.map((i) => ({ ingredientId: i.ingredientId, grams: i.amountG })),
    });
    const customMacros = {
      calories: Math.round(calcResult.totalKcal),
      proteinG: Math.round(calcResult.totalProteinG),
      carbsG: Math.round(calcResult.totalCarbsG),
      fatG: Math.round(calcResult.totalFatG),
      fiberG: Math.round(calcResult.totalFiberG),
    };
    const customIngredients = ings.map((i) => ({
      ingredientId: i.ingredientId,
      name: i.name,
      amountG: i.amountG,
    }));
    const calculatedKr = Math.round(calcResult.totalPriceOre / 100);
    const ingredientSurchargeKr = Math.max(0, calculatedKr - meal.basePrice);
    return {
      slot,
      target,
      status: "ready",
      meal,
      optimizedIngredients: ings,
      calcResult,
      customMacros,
      customIngredients,
      containerTypeId,
      ingredientSurchargeKr,
    };
  } catch {
    return { slot, target, status: "error", reason: "calculateMeal" };
  }
}

/* ── Per-slot optimizer + calculate ─────────────────────── */

export async function buildSlotResult(
  slot: WizardSlot,
  target: ApiMealDistribution,
  meals: ApiMeal[],
  library: ApiIngredient[],
  containers: ApiContainerType[],
  excludeIds: Set<string> = new Set()
): Promise<SlotResult> {
  const tag = SLOT_TO_MEAL_TIME_TAG[slot];
  const allCandidates = meals.filter((m) => m.available !== false && m.mealTimeTags?.includes(tag));
  if (allCandidates.length === 0) return { slot, target, status: "missing" };
  // Exclude already-selected meal IDs; fall back to full list if nothing remains
  const filtered = allCandidates.filter((m) => !excludeIds.has(m.id));
  const candidates = filtered.length > 0 ? filtered : allCandidates;

  type Scored = { meal: ApiMeal; ings: OptIngredient[]; score: number };
  const scored: Scored[] = [];
  for (const meal of candidates) {
    const ings = optimizeIngredients(meal.ingredients, library, target);
    if (ings.length === 0) continue;
    let kcal = 0,
      protein = 0;
    for (const ing of ings) {
      const lib = library.find((l) => l.id === ing.ingredientId);
      if (!lib) continue;
      const f = ing.amountG / 100;
      kcal += lib.calories100g * f;
      protein += lib.proteinG100g * f;
    }
    const score = Math.abs(kcal - target.calories) + Math.abs(protein - target.proteinG) * 4;
    scored.push({ meal, ings, score });
  }
  if (scored.length === 0) return { slot, target, status: "missing" };

  scored.sort((a, b) => a.score - b.score);
  const best = scored[0];
  return calculateResult(slot, target, best.meal, best.ings, containers);
}

/* ── Fixed-product builder for Mellanmål (no optimizer, base gram amounts) ── */

export async function buildFixedSlotResultForMeal(
  slot: WizardSlot,
  target: ApiMealDistribution,
  meal: ApiMeal,
  containers: ApiContainerType[]
): Promise<SlotResult> {
  const ings: OptIngredient[] = meal.ingredients
    .filter((i) => !!i.ingredientId)
    .map((i) => ({ ingredientId: i.ingredientId!, name: i.name, amountG: i.amountG }));
  if (ings.length === 0) return { slot, target, status: "missing" };
  return calculateResult(slot, target, meal, ings, containers);
}

// Picks the cheapest eligible snack candidate and builds a fixed result
export async function buildFixedSlotResult(
  slot: WizardSlot,
  target: ApiMealDistribution,
  meals: ApiMeal[],
  containers: ApiContainerType[]
): Promise<SlotResult> {
  const tag = SLOT_TO_MEAL_TIME_TAG[slot];
  const candidates = meals
    .filter((m) => m.available !== false && m.mealTimeTags?.includes(tag))
    .sort((a, b) => a.basePrice - b.basePrice);
  if (candidates.length === 0) return { slot, target, status: "missing" };
  return buildFixedSlotResultForMeal(slot, target, candidates[0], containers);
}

// Optimizer for a specific meal (used by Lunch/Middag swap)
export async function buildSlotResultForMeal(
  slot: WizardSlot,
  target: ApiMealDistribution,
  meal: ApiMeal,
  library: ApiIngredient[],
  containers: ApiContainerType[]
): Promise<SlotResult> {
  const ings = optimizeIngredients(meal.ingredients, library, target);
  if (ings.length === 0) return { slot, target, status: "missing" };
  return calculateResult(slot, target, meal, ings, containers);
}
