import type { MacroTargetDto } from "@/services/api/nutrition";

/**
 * The five daily nutrients, as concentric progress rings.
 *
 * READ-ONLY. Nothing here computes a target, a calorie need or a portion —
 * it takes the two answers Home already has and turns them into arc
 * lengths. Both come from the same source TodayCard renders its numbers
 * from, so the rings can never disagree with the text beside them:
 *
 *   target   = the active daily goal (deriveActiveDailyNutrition().target,
 *              i.e. the backend's carb-cycled adjustedTarget), falling back
 *              to today.adjustedTarget exactly as the card does.
 *   consumed = /nutrition-profile/remaining-today's `consumedToday`.
 *
 * FIBER IS REAL. It is not padded out to match the reference picture: the
 * backend's MacroTargetDto carries FiberG on both the target and the
 * consumed side (NutritionEngineService derives it as 14 g per 1000 kcal,
 * floored at 15), and the mobile type has always had it. If it were
 * missing this module would have shipped four rings, not a guessed 25.
 */

export type NutrientKey = "calories" | "carbs" | "protein" | "fat" | "fiber";

export interface NutrientRing {
  key: NutrientKey;
  /** Ring colour, outermost first. */
  color: string;
  /** What the customer has had today. Real number, never clamped. */
  consumed: number;
  /** The daily goal. May legitimately be 0 before a profile exists. */
  target: number;
  /** 0..1 for drawing. Clamped — a ring cannot be more than full. */
  progress: number;
  /** Grams for macros and fiber; calories are unitless kcal. */
  unit: "g" | "kcal";
}

/** Outermost ring first — the order the reference design uses. */
export const RING_COLORS: Record<NutrientKey, string> = {
  calories: "#FF8A3D", // orange
  carbs: "#5FA0FF", // blue
  protein: "#FF5A5A", // red
  fat: "#7FC97F", // green
  fiber: "#B98CFF", // purple
};

/**
 * Fraction of the goal reached, for drawing only.
 *
 * A zero or absent target must produce 0, not NaN or Infinity: an empty
 * profile is a real state, and `0/0` would otherwise reach the SVG as a
 * dash offset of NaN and blank the whole ring stack.
 */
export function ringProgress(consumed: number, target: number): number {
  if (!Number.isFinite(consumed) || !Number.isFinite(target) || target <= 0) return 0;
  const raw = consumed / target;
  if (raw <= 0) return 0;
  return raw > 1 ? 1 : raw;
}

export function buildNutrientRings(
  target: MacroTargetDto | null | undefined,
  consumed: MacroTargetDto | null | undefined
): NutrientRing[] {
  const t = target ?? { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
  const c = consumed ?? { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

  // Outermost ring first — calories, then the macros, then fiber.
  const rows: [NutrientKey, number, number, "g" | "kcal"][] = [
    ["calories", c.calories, t.calories, "kcal"],
    ["carbs", c.carbsG, t.carbsG, "g"],
    ["protein", c.proteinG, t.proteinG, "g"],
    ["fat", c.fatG, t.fatG, "g"],
    ["fiber", c.fiberG, t.fiberG, "g"],
  ];

  return rows.map(([key, consumedValue, targetValue, unit]) => ({
    key,
    color: RING_COLORS[key],
    consumed: Math.max(0, Math.round(consumedValue)),
    target: Math.max(0, Math.round(targetValue)),
    progress: ringProgress(consumedValue, targetValue),
    unit,
  }));
}

/** "0 / 1780" or "0g / 181g" — the exact format the reference design uses. */
export function formatRingValue(ring: NutrientRing): string {
  const suffix = ring.unit === "g" ? "g" : "";
  return `${ring.consumed}${suffix} / ${ring.target}${suffix}`;
}

/** Geometry for one ring in a stack, outermost first (index 0). */
export function ringGeometry(size: number, strokeWidth: number, gap: number, index: number) {
  const radius = size / 2 - strokeWidth / 2 - index * (strokeWidth + gap);
  const circumference = 2 * Math.PI * radius;
  return { radius, circumference };
}

/** How much of the stroke to hide. Full ring = 0 hidden. */
export function dashOffset(circumference: number, progress: number): number {
  return circumference * (1 - progress);
}

/** Overall share of the day's goals reached — one number for the a11y
 *  label, so a screen reader hears something meaningful rather than five
 *  separate percentages. */
export function overallProgressPercent(rings: NutrientRing[]): number {
  const withTarget = rings.filter((r) => r.target > 0);
  if (withTarget.length === 0) return 0;
  const sum = withTarget.reduce((acc, r) => acc + r.progress, 0);
  return Math.round((sum / withTarget.length) * 100);
}
