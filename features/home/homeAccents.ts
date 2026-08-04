import { colors } from "@/theme";

/**
 * Home's local accent mapping (patch 11 visual pass). NOT global design
 * tokens — the global palette (accent orange, success green) already
 * carries the app; these are the per-surface pairings Home uses to give
 * its cards the same colour presence as Meny/Rewards. The single new hue
 * (warm amber) stays local to Home on purpose: promote it to theme/colors
 * only if a second feature needs it.
 *
 * Colour is never the only information carrier — every coloured value on
 * Home keeps its text label.
 */
export const homeAccents = {
  /** Protein — the app's signature accent. */
  protein: { value: colors.accent, soft: colors.accentSoft, border: colors.accentBorder },
  /** Carbs — the established success green. */
  carbs: {
    value: colors.success,
    soft: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.22)",
  },
  /** Fat — warm amber, Home-local. */
  fat: {
    value: "#E8B93A",
    soft: "rgba(232,185,58,0.10)",
    border: "rgba(232,185,58,0.22)",
  },
} as const;

/** Hero gradient — the soft accent wash Rewards/Heldag already use,
 * fading into the standard card colour so text contrast is unchanged. */
export const heroGradient = [
  "rgba(232,101,10,0.20)",
  "rgba(232,101,10,0.06)",
  colors.card,
] as const;
