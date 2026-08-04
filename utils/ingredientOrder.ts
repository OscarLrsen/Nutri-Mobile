import type { AppLanguage } from "@/i18n";

/**
 * Ingredient display order: biggest amount first.
 *
 * WHY. The list was rendered in the RECIPE's own order, which is the order the
 * kitchen wrote the recipe in — so a 10 g drizzle of honey could sit above the
 * 200 g of sweet potato that actually makes up the meal. The customer reads
 * this list to understand what they are eating; the largest components belong
 * at the top.
 *
 * Sorted on the AMOUNT ACTUALLY SHOWN, so it must be called after the personal
 * portion has been calculated and after any size scaling — never on the raw
 * recipe. Switching M/L therefore reorders the list by itself.
 *
 * Ties break alphabetically on the DISPLAYED name using the reader's locale,
 * so Swedish å/ä/ö sort after z rather than next to a.
 *
 * Missing or nonsensical amounts sink to the bottom instead of pretending to
 * be zero-gram ingredients at a meaningful position.
 *
 * Returns a NEW array — the input is often a React Query cache value, and
 * Array.prototype.sort mutates in place.
 */
export type SortableIngredient = {
  /** The name as rendered to the customer — that is what ties sort on. */
  name: string;
  /** Grams as displayed. Null/undefined/NaN are treated as "unknown". */
  amountG?: number | string | null;
};

/** Number, or null when the value cannot be read as a real amount. */
function amountOf(value: SortableIngredient["amountG"]): number | null {
  if (value === null || value === undefined) return null;
  // Defensive: an API that ever serialises grams as a string must not be
  // compared lexicographically ("50" > "200").
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function sortIngredientsByAmount<T extends SortableIngredient>(
  ingredients: readonly T[],
  language: AppLanguage,
): T[] {
  return [...ingredients].sort((a, b) => {
    const amountA = amountOf(a.amountG);
    const amountB = amountOf(b.amountG);

    // Unknown amounts last, but still ordered among themselves by name.
    if (amountA === null && amountB !== null) return 1;
    if (amountB === null && amountA !== null) return -1;

    if (amountA !== null && amountB !== null && amountA !== amountB) {
      return amountB - amountA;
    }

    return (a.name ?? "").localeCompare(b.name ?? "", language);
  });
}
