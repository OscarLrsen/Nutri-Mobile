import type { ApiDrink } from "@/services/api/drinks";
import { colors } from "@/theme";

/**
 * GoWell flavour identity mapping (patch 11). The PRODUCTS come from the
 * backend (id, name, price, stock, image — nothing hardcoded here); this
 * module only maps a STABLE, normalized flavour name to its visual
 * identity (background gradient + accent) for the carousel.
 *
 * Identification: the backend drink model has no GoWell flag, so a drink
 * counts as GoWell when its normalized name matches a known flavour OR
 * contains "gowell" (future-proofing for renamed products). A GoWell
 * drink whose flavour has no visual entry gets the NEUTRAL fallback —
 * layout never breaks on unknown future flavours. Anything else (LOKA,
 * water, future drinks) is NOT GoWell and keeps the standard drink card.
 */

export interface GoWellFlavorVisual {
  /** Dark-theme background wash, top → bottom. */
  gradient: readonly [string, string, string];
  /** Accent used for the flavour name + pagination dot. */
  accent: string;
}

const NEUTRAL_VISUAL: GoWellFlavorVisual = {
  gradient: ["rgba(232,101,10,0.22)", "rgba(232,101,10,0.08)", colors.card],
  accent: colors.accent,
};

/** Keyed on normalized flavour names as they exist in Nutri's data source
 * (verified against the live drink catalogue). */
const FLAVOR_VISUALS: Record<string, GoWellFlavorVisual> = {
  tropical: {
    gradient: ["rgba(245,158,11,0.26)", "rgba(245,158,11,0.09)", colors.card],
    accent: "#F5A623",
  },
  cola: {
    gradient: ["rgba(160,82,32,0.30)", "rgba(160,82,32,0.10)", colors.card],
    accent: "#C98A4B",
  },
  "jordgubb & lime": {
    gradient: ["rgba(225,29,72,0.24)", "rgba(132,204,22,0.08)", colors.card],
    accent: "#F0526E",
  },
  "svarta vinbär & blåbär": {
    gradient: ["rgba(124,58,237,0.26)", "rgba(59,130,246,0.09)", colors.card],
    accent: "#A78BFA",
  },
  "hallon, jordgubb & mynta": {
    gradient: ["rgba(236,72,153,0.24)", "rgba(45,212,191,0.08)", colors.card],
    accent: "#F472B6",
  },
  "ananas & kaktus": {
    gradient: ["rgba(202,224,20,0.20)", "rgba(34,197,94,0.08)", colors.card],
    accent: "#BBD332",
  },
};

function normalizeFlavorName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when the drink belongs to the GoWell family (known flavour name
 * or explicit "GoWell" branding in the product name). */
export function isGoWellDrink(drink: ApiDrink): boolean {
  const normalized = normalizeFlavorName(drink.name);
  return normalized.includes("gowell") || normalized in FLAVOR_VISUALS;
}

/** Visual identity for a GoWell drink — neutral fallback for flavours the
 * mapping doesn't know yet. */
export function getGoWellVisual(drink: ApiDrink): GoWellFlavorVisual {
  return FLAVOR_VISUALS[normalizeFlavorName(drink.name)] ?? NEUTRAL_VISUAL;
}
