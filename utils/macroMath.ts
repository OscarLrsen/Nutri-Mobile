/**
 * Verbatim port of Nutri-Frontend's src/lib/macroMath.ts. Calories are
 * always derived from macros (4/4/9 kcal per g) when normalizing a custom
 * snapshot, so the same customMacros object produces the same calories on
 * both platforms.
 */
export interface MacroLike {
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
}

export interface MacroSnapshot extends MacroLike {
  calories: number;
}

export function getMacroCalories(proteinG: number, carbsG: number, fatG: number) {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

export function deriveCaloriesFromMacros(macros: MacroLike) {
  return getMacroCalories(macros.proteinG, macros.carbsG, macros.fatG);
}

export function normalizeMacroSnapshot<T extends MacroLike>(
  macros: T & { calories?: number }
): T & { calories: number } {
  return {
    ...macros,
    calories: deriveCaloriesFromMacros(macros),
  };
}
