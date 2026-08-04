import type { ApiDrink } from "@/services/api/drinks";
import type { AppLanguage } from "@/i18n/languages";
import { colors } from "@/theme";
import { drinkName } from "./drinkText";

/**
 * GoWell flavour VISUAL identity — nothing else (patch 17B).
 *
 * Whether a drink IS GoWell is now `drink.isGoWell`, an admin-set backend
 * flag. This module used to answer that question by matching the product
 * name, which meant renaming a flavour silently changed a business rule and
 * any drink called "GoWell …" would have started giving itself away. Names
 * decide colours here and nothing more.
 *
 * The locked design is a compact premium card with the product image at its
 * centre, so each flavour carries an accent (name, selected border, check)
 * and a soft wash behind the image — not the full-card gradient the previous
 * carousel used.
 *
 * A flavour with no entry gets the NEUTRAL identity, so a product the app has
 * never heard of still renders correctly instead of breaking the layout.
 */

export interface GoWellFlavorVisual {
  /** Flavour name, selected border and check icon. */
  accent: string;
  /** Subtle wash behind the product image. */
  soft: string;
}

const NEUTRAL_VISUAL: GoWellFlavorVisual = {
  accent: colors.accent,
  soft: "rgba(232,101,10,0.10)",
};

/** Keyed on normalized flavour names as they exist in Nutri's catalogue. */
const FLAVOR_VISUALS: Record<string, GoWellFlavorVisual> = {
  tropical: { accent: "#F5A623", soft: "rgba(245,166,35,0.12)" },
  cola: { accent: "#C98A4B", soft: "rgba(201,138,75,0.12)" },
  "jordgubb & lime": { accent: "#F0526E", soft: "rgba(240,82,110,0.12)" },
  "svarta vinbär & blåbär": { accent: "#A78BFA", soft: "rgba(167,139,250,0.12)" },
  "hallon, jordgubb & mynta": { accent: "#F472B6", soft: "rgba(244,114,182,0.12)" },
  "ananas & kaktus": { accent: "#BBD332", soft: "rgba(187,211,50,0.12)" },
};

function normalizeFlavorName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Visual identity for a GoWell drink. Presentation only — callers decide what
 * counts as GoWell via `drink.isGoWell`, never via this module.
 */
export function getGoWellVisual(drink: ApiDrink): GoWellFlavorVisual {
  return FLAVOR_VISUALS[normalizeFlavorName(drink.name)] ?? NEUTRAL_VISUAL;
}

/**
 * The flavour name to show on a card. GoWell products are named by flavour
 * ("Tropical"), so a "GoWell" prefix is stripped rather than repeated beside
 * the section heading that already says it.
 *
 * Takes the language because this is display text: a Danish app should read
 * the Danish flavour name where the admin has written one. Note that
 * getGoWellVisual above deliberately keeps keying on the Swedish `drink.name`
 * — the accent colour must not move when someone adds a translation.
 */
export function goWellFlavorLabel(drink: ApiDrink, language: AppLanguage): string {
  const localized = drinkName(drink, language).trim();
  const withoutBrand = localized.replace(/^gowell\s*/i, "").trim();
  return withoutBrand.length > 0 ? withoutBrand : localized;
}

/** True when the drink can actually be handed over right now. */
export function isDrinkInStock(drink: ApiDrink): boolean {
  return drink.isAvailable && (drink.stockQuantity ?? 0) > 0;
}
