/**
 * Ultra-rare classification for Spin the Wheel prizes.
 *
 * UNIT: the backend stores a RELATIVE draw weight per segment
 * (ApiWheelSegment.probabilityWeight, integer ≥ 1) — never a percentage.
 * The customer-facing probability is the segment's share of the total
 * weight, expressed here as a percent in the 0–100 range.
 *
 * Product rule: strictly below 5 % is ultra-rare (gold, glossy, content
 * hidden in previews); exactly 5 % and above keeps the normal
 * presentation. The comparison is centralised here — never spread raw
 * `< 5` checks across components.
 */

export const ULTRA_RARE_THRESHOLD_PERCENT = 5;

/** Share of the total draw weight as 0–100 percent. Guards zero/negative
 * totals (no segments → nothing can be ultra-rare). */
export function wheelSharePercent(weight: number, totalWeight: number): number {
  if (!(totalWeight > 0) || !(weight > 0)) return 0;
  return (weight / totalWeight) * 100;
}

export function isUltraRarePrize(sharePercent: number): boolean {
  return sharePercent > 0 && sharePercent < ULTRA_RARE_THRESHOLD_PERCENT;
}
