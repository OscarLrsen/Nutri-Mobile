import type { Ore } from "@/types/api";

/**
 * Öre → kronor display formatting. Money is öre everywhere on the wire
 * (spec §0/§14.3/§18.5) — this is the *only* place that should convert to
 * kronor for display, mirroring Nutri-Frontend's `formatPriceKr` (referenced
 * throughout /meny, /varukorg — spec §14.3). Never do this conversion
 * inline in a component.
 */
/**
 * Kronor → öre for values computed in kr by web-ported code (the cart's
 * totalPrice/line prices are computed in kr, exactly like the web
 * CartContext). Rounding to whole öre matches how the backend stores money.
 */
export function krToOre(valueKr: number): Ore {
  return Math.round(valueKr * 100);
}

export function formatPriceKr(ore: Ore): string {
  const kr = ore / 100;
  const rounded = Math.round(kr * 100) / 100;
  const hasDecimals = rounded % 1 !== 0;
  return `${rounded.toLocaleString("sv-SE", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })} kr`;
}
