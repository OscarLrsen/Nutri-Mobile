import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ArrowLeft, ChevronDown, ChevronUp, Minus, Plus, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiMeal } from "@/services/api/meals";
import type { ApiIngredient } from "@/services/api/ingredients";
import type { ApiContainerType } from "@/services/api/containerTypes";
import { calculateCustomMeal, type CustomMealCalculateResponse } from "@/services/api/customMeal";
import { getIngredientStock } from "@/services/api/ingredientStock";
import { nutriAnpassarCopy as copy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";
import type { OptIngredient } from "./optimizer";

/**
 * Step 2.5 — ingredient adjustment. Port of the web's
 * components/anpassar/StepAdjust.tsx, behavior-complete:
 * - debounced (300ms) server recalculation with request-id race guarding
 *   and an isDirty flag that disables the CTA until the server has priced
 *   the current state (never add an unpriced meal to the cart)
 * - ±5g steppers clamped to the library's min/max amounts
 * - remove (disabled for the last remaining ingredient)
 * - extras: isExtraOption library items not already in the meal and not
 *   explicitly out of stock (public stock endpoint; missing entries stay
 *   visible — backend validates at order time)
 * - the carb ledger: adding a carb extra reduces the existing carb source
 *   by carb-equivalent grams, and removing that extra restores exactly the
 *   recorded reduction, nothing more
 * - container auto-repick on every mutation (smallest active container that
 *   fits the total weight)
 * - grouped display in the web's fixed group order with category subtitles,
 *   optional per-ingredient macros, protein goal rail, "+Xg" delta vs the
 *   optimizer's baseline
 */

type AdjustIngredient = OptIngredient & { ledgerId?: string };

const DEBOUNCE_MS = 300;
const GREEN = "rgb(90,210,140)";

const CARB_CATEGORIES = new Set(["Baser", "Frukt", "Kolhydrater"]);

const INGREDIENT_GROUP_ORDER = ["Protein", "Bas", "Sås & smak", "Toppings & fett", "Grönsaker"] as const;
const CATEGORY_TO_GROUP: Record<string, string> = {
  Protein: "Protein",
  Baser: "Bas",
  Kolhydrater: "Bas",
  Frukt: "Bas",
  Såser: "Sås & smak",
  Mejeri: "Sås & smak",
  Toppings: "Toppings & fett",
  Fetter: "Toppings & fett",
  Grönsaker: "Grönsaker",
};

function startAmount(lib: ApiIngredient): number {
  if (lib.minAmountG != null && Number(lib.minAmountG) > 0) return Number(lib.minAmountG);
  if (lib.defaultAmountG > 0) return lib.defaultAmountG;
  return 50;
}

function pickContainer(
  ings: OptIngredient[],
  containerTypes: ApiContainerType[],
  fallback: string
): string {
  const totalWeight = ings.reduce((s, i) => s + i.amountG, 0);
  const active = containerTypes.filter((c) => c.isActive);
  if (active.length === 0) return fallback;
  const sorted = [...active].sort((a, b) => a.maxWeightGrams - b.maxWeightGrams);
  return (sorted.find((c) => c.maxWeightGrams >= totalWeight) ?? sorted[sorted.length - 1]).id;
}

function slotWord(tags: string[]): string {
  if (tags.includes("Lunch")) return copy.slotWordLunch;
  if (tags.includes("Dinner")) return copy.slotWordDinner;
  if (tags.includes("Breakfast")) return copy.slotWordBreakfast;
  return copy.slotWordDay;
}

interface Props {
  meal: ApiMeal;
  initialIngredients: OptIngredient[];
  initialContainerTypeId: string;
  ingredientLibrary: ApiIngredient[];
  containerTypes: ApiContainerType[];
  slotTargetProtein: number;
  slotTargetCalories: number;
  isClosed: boolean;
  onConfirm: (
    ingredients: OptIngredient[],
    containerTypeId: string,
    calcResult: CustomMealCalculateResponse
  ) => void;
  onBack: () => void;
}

export function StepAdjust({
  meal,
  initialIngredients,
  initialContainerTypeId,
  ingredientLibrary,
  containerTypes,
  slotTargetProtein,
  slotTargetCalories,
  isClosed,
  onConfirm,
  onBack,
}: Props) {
  const [ingredients, setIngredients] = useState<AdjustIngredient[]>(
    initialIngredients as AdjustIngredient[]
  );
  const [containerTypeId, setContainerTypeId] = useState(initialContainerTypeId);
  const [calcResult, setCalcResult] = useState<CustomMealCalculateResponse | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [outOfStockIds, setOutOfStockIds] = useState<Set<string>>(new Set());
  const [showIngredientMacros, setShowIngredientMacros] = useState(false);
  // isDirty mirrored into state so the CTA disabled-style re-renders (the
  // web relies on the calc completing to re-render; RN needs the state tick).
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getIngredientStock()
      .then((items) => {
        if (cancelled) return;
        setOutOfStockIds(
          new Set(items.filter((s) => s.availableGrams <= 0).map((s) => s.ingredientId))
        );
      })
      .catch(() => {
        // Fall back to showing all extras; order validation is the backstop.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const baselineProtein = useRef<number | null>(null);

  // Carb ledger — each add-driven reduction is recorded so remove can undo
  // exactly its own reduction (web parity).
  const carbLedgerRef = useRef<
    {
      ledgerId: string;
      extraIngredientId: string;
      reducedIngredientId: string;
      reducedAmountG: number;
    }[]
  >([]);

  const recalculate = useCallback(async (ings: OptIngredient[], ctId: string) => {
    if (ings.length === 0) return;
    const reqId = ++requestIdRef.current;
    setCalcLoading(true);
    setCalcError(null);
    try {
      const result = await calculateCustomMeal({
        containerTypeId: ctId,
        items: ings.map((i) => ({ ingredientId: i.ingredientId, grams: i.amountG })),
      });
      if (reqId === requestIdRef.current) {
        setCalcResult(result);
        setCalcError(null);
        setDirty(false);
        if (baselineProtein.current == null) {
          baselineProtein.current = result.totalProteinG;
        }
      }
    } catch {
      if (reqId === requestIdRef.current) {
        setCalcError(copy.adjustCalcError);
        setDirty(false);
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setCalcLoading(false);
      }
    }
  }, []);

  function scheduleCalculate(ings: OptIngredient[], ctId: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => recalculate(ings, ctId), DEBOUNCE_MS);
  }

  useEffect(() => {
    recalculate(initialIngredients, initialContainerTypeId);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyChange(ingredientId: string, delta: number) {
    setDirty(true);
    const lib = ingredientLibrary.find((l) => l.id === ingredientId);
    const minG = lib?.minAmountG != null ? Number(lib.minAmountG) : 0;
    const maxG = lib?.maxAmountG != null ? Number(lib.maxAmountG) : 999;

    setIngredients((prev) => {
      const next = prev.map((ing) =>
        ing.ingredientId !== ingredientId
          ? ing
          : { ...ing, amountG: Math.max(minG, Math.min(maxG, ing.amountG + delta)) }
      );
      const newCtId = pickContainer(next, containerTypes, containerTypeId);
      setContainerTypeId(newCtId);
      scheduleCalculate(next, newCtId);
      return next;
    });
  }

  function removeIngredient(ingredientId: string) {
    setDirty(true);

    const removedIng = ingredients.find((i) => i.ingredientId === ingredientId);
    let next = ingredients.filter((i) => i.ingredientId !== ingredientId);

    if (removedIng?.ledgerId) {
      const entryIdx = carbLedgerRef.current.findIndex((e) => e.ledgerId === removedIng.ledgerId);
      if (entryIdx !== -1) {
        const entry = carbLedgerRef.current[entryIdx];
        next = next.map((ing) =>
          ing.ingredientId === entry.reducedIngredientId
            ? { ...ing, amountG: ing.amountG + entry.reducedAmountG }
            : ing
        );
        carbLedgerRef.current.splice(entryIdx, 1);
      }
    }

    const newCtId = pickContainer(next, containerTypes, containerTypeId);
    setContainerTypeId(newCtId);
    setIngredients(next);
    scheduleCalculate(next, newCtId);
  }

  function addExtra(lib: ApiIngredient) {
    if (ingredients.some((i) => i.ingredientId === lib.id)) return;
    setDirty(true);

    const newAmountG = startAmount(lib);
    let newEntry: AdjustIngredient = { ingredientId: lib.id, name: lib.name, amountG: newAmountG };
    let withNew: AdjustIngredient[] = [...ingredients, newEntry];

    if (CARB_CATEGORIES.has(lib.category) && lib.carbsG100g > 0) {
      const addedCarbs = (newAmountG / 100) * lib.carbsG100g;
      const existingCarbIdx = ingredients.findIndex((ing) => {
        const l = ingredientLibrary.find((x) => x.id === ing.ingredientId);
        return l != null && CARB_CATEGORIES.has(l.category) && l.carbsG100g > 0;
      });

      if (existingCarbIdx !== -1) {
        const existingIng = ingredients[existingCarbIdx];
        const existingLib = ingredientLibrary.find((x) => x.id === existingIng.ingredientId)!;
        const minG = existingLib.minAmountG != null ? Number(existingLib.minAmountG) : 0;
        const gramsToReduce = addedCarbs / (existingLib.carbsG100g / 100);
        const actualReduction = Math.max(0, Math.min(gramsToReduce, existingIng.amountG - minG));
        const reducedAmountG = Math.round(actualReduction);
        const ledgerId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        newEntry = { ...newEntry, ledgerId };
        withNew = withNew.map((ing) => {
          if (ing.ingredientId === lib.id) return newEntry;
          if (ing.ingredientId === existingIng.ingredientId)
            return { ...ing, amountG: Math.round(existingIng.amountG - actualReduction) };
          return ing;
        });

        carbLedgerRef.current.push({
          ledgerId,
          extraIngredientId: lib.id,
          reducedIngredientId: existingIng.ingredientId,
          reducedAmountG,
        });
      }
    }

    const newCtId = pickContainer(withNew, containerTypes, containerTypeId);
    setContainerTypeId(newCtId);
    setIngredients(withNew);
    scheduleCalculate(withNew, newCtId);
  }

  // ── Derived display values (web parity) ──
  const displayProtein = calcResult ? Math.round(calcResult.totalProteinG) : null;
  const displayCalories = calcResult ? Math.round(calcResult.totalKcal) : null;
  const displayCarbs = calcResult ? Math.round(calcResult.totalCarbsG) : null;
  const displayFat = calcResult ? Math.round(calcResult.totalFatG) : null;
  const displayPrice = calcResult ? Math.round(calcResult.totalPriceOre / 100) : null;
  const proteinDelta =
    displayProtein != null && baselineProtein.current != null
      ? Math.round(displayProtein - baselineProtein.current)
      : null;

  const goalFill =
    displayProtein != null && slotTargetProtein > 0
      ? Math.min(100, Math.round((displayProtein / slotTargetProtein) * 100))
      : 0;

  const addedIds = new Set(ingredients.map((i) => i.ingredientId));
  const availableExtras = ingredientLibrary.filter(
    (lib) => lib.isExtraOption === true && !addedIds.has(lib.id) && !outOfStockIds.has(lib.id)
  );
  const extraIds = new Set(
    ingredientLibrary.filter((l) => l.isExtraOption === true).map((l) => l.id)
  );

  const ctaDisabled = !calcResult || calcLoading || dirty || ingredients.length === 0;

  // Group ordering (web parity)
  const groupMap = new Map<string, AdjustIngredient[]>();
  for (const ing of ingredients) {
    const lib = ingredientLibrary.find((l) => l.id === ing.ingredientId);
    const group = lib ? (CATEGORY_TO_GROUP[lib.category] ?? "Övrigt") : "Övrigt";
    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group)!.push(ing);
  }
  const orderedIngredients: { ing: AdjustIngredient; group: string; isFirstInGroup: boolean }[] =
    [];
  for (const g of [...INGREDIENT_GROUP_ORDER, "Övrigt"]) {
    const items = groupMap.get(g);
    if (items) items.forEach((ing, i) => orderedIngredients.push({ ing, group: g, isFirstInGroup: i === 0 }));
  }

  return (
    <View style={{ paddingBottom: 8 }}>
      {/* Change-meal link */}
      <Pressable onPress={onBack} style={styles.backLink} accessibilityRole="button">
        <ArrowLeft size={12} color="rgba(255,255,255,0.45)" strokeWidth={2} />
        <ThemedText style={styles.backLinkText}>{copy.adjustChooseAnotherMeal}</ThemedText>
      </Pressable>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.stepRow}>
          <ThemedText style={styles.stepAccent}>{copy.step2.toUpperCase()}</ThemedText>
          <ThemedText style={styles.stepDot}>·</ThemedText>
          <ThemedText style={styles.stepMuted}>{copy.adjustLabel.toUpperCase()}</ThemedText>
        </View>
        <ThemedText style={styles.heroTitle}>{meal.name}</ThemedText>
        <View style={styles.targetRow}>
          <ThemedText style={styles.targetLabel}>{copy.adjustMealTarget}</ThemedText>
          <ThemedText style={styles.targetValue}>{slotTargetCalories} kcal</ThemedText>
          <View style={styles.dot} />
          <ThemedText style={styles.targetValue}>{slotTargetProtein}g protein</ThemedText>
        </View>
      </View>

      {/* Summary card */}
      <View style={styles.summaryCard}>
        {calcLoading && !calcResult ? (
          <ThemedText style={styles.calcLoadingText}>{copy.adjustCalculating}</ThemedText>
        ) : calcResult ? (
          <View>
            <View style={styles.summaryTopRow}>
              <View style={styles.summaryProteinRow}>
                <ThemedText style={styles.summaryProtein}>
                  {displayProtein}g {copy.protein.toLowerCase()}
                </ThemedText>
                {proteinDelta != null && proteinDelta > 0 && (
                  <View style={styles.deltaPill}>
                    <ThemedText style={styles.deltaPillText}>▲ +{proteinDelta}g</ThemedText>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {calcLoading && <ThemedText style={styles.calcSpinnerDot}>…</ThemedText>}
                {displayPrice != null && (
                  <ThemedText style={styles.summaryPrice}>{displayPrice} kr</ThemedText>
                )}
              </View>
            </View>

            <View style={styles.summaryMacroRow}>
              <ThemedText style={styles.summaryMacro}>
                {displayCalories}
                <ThemedText style={styles.summaryMacroUnit}> kcal</ThemedText>
              </ThemedText>
              <View style={styles.dot} />
              <ThemedText style={styles.summaryMacro}>
                {displayCarbs}g<ThemedText style={styles.summaryMacroUnit}> {copy.carbsShort}</ThemedText>
              </ThemedText>
              <View style={styles.dot} />
              <ThemedText style={styles.summaryMacro}>
                {displayFat}g<ThemedText style={styles.summaryMacroUnit}> {copy.fatShort}</ThemedText>
              </ThemedText>
            </View>

            {/* Goal rail */}
            {displayProtein != null && slotTargetProtein > 0 && (
              <View style={styles.goalRailWrap}>
                <View style={styles.goalRail}>
                  <View style={[styles.goalRailFill, { width: `${goalFill}%` }]} />
                </View>
                <View style={styles.goalRailLabels}>
                  <ThemedText style={styles.goalRailLabel}>{copy.adjustProteinProgress}</ThemedText>
                  <ThemedText style={styles.goalRailLabel}>
                    <ThemedText style={styles.goalRailStrong}>{displayProtein}g</ThemedText> /{" "}
                    {slotTargetProtein}g
                  </ThemedText>
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {calcError ? <ThemedText style={styles.calcErrorText}>{calcError}</ThemedText> : null}

      {/* Why-line */}
      {calcResult && proteinDelta != null && proteinDelta > 0 && (
        <View style={styles.whyRow}>
          <ThemedText style={styles.whyText}>{copy.adjustWhy(slotWord(meal.mealTimeTags))}</ThemedText>
        </View>
      )}

      {/* Ingredients head + macro toggle */}
      <View style={styles.sectionHeadRow}>
        <ThemedText style={styles.sectionHead}>{copy.adjustIngredients.toUpperCase()}</ThemedText>
        <Pressable
          onPress={() => setShowIngredientMacros((v) => !v)}
          style={[styles.macroToggle, showIngredientMacros && { backgroundColor: "rgba(232,101,10,0.12)" }]}
          accessibilityRole="button"
        >
          <ThemedText style={styles.macroToggleText}>{copy.adjustMacrosKcal}</ThemedText>
          {showIngredientMacros ? (
            <ChevronUp size={9} color={colors.accent} strokeWidth={1.4} />
          ) : (
            <ChevronDown size={9} color={colors.accent} strokeWidth={1.4} />
          )}
        </Pressable>
      </View>

      {/* Ingredient list */}
      <View style={styles.listCard}>
        {orderedIngredients.map(({ ing, group, isFirstInGroup }, flatIdx) => {
          const lib = ingredientLibrary.find((l) => l.id === ing.ingredientId);
          const minG = lib?.minAmountG != null ? Number(lib.minAmountG) : 0;
          const maxG = lib?.maxAmountG != null ? Number(lib.maxAmountG) : 999;
          const isExtra = extraIds.has(ing.ingredientId);
          const isLast = flatIdx === orderedIngredients.length - 1;
          const categoryLabelText = lib ? (copy.categoryNames[lib.category] ?? lib.category) : "";
          const ingKcal = lib ? Math.round((ing.amountG / 100) * lib.calories100g) : null;
          const ingProtein = lib ? Math.round((ing.amountG / 100) * lib.proteinG100g) : null;
          const isLastIngredient = ingredients.length <= 1;

          return (
            <Fragment key={ing.ingredientId}>
              {isFirstInGroup && (
                <View
                  style={[
                    styles.groupHead,
                    flatIdx > 0 && { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 10 },
                  ]}
                >
                  <ThemedText style={styles.groupHeadText}>
                    {(copy.groupNames[group] ?? group).toUpperCase()}
                  </ThemedText>
                </View>
              )}
              <View style={[styles.ingRow, !isLast && styles.ingRowBorder]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {isExtra && <View style={styles.extraDot} />}
                    <ThemedText style={styles.ingName} numberOfLines={1}>
                      {ing.name}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.ingMeta} numberOfLines={1}>
                    {isExtra ? (
                      <ThemedText style={[styles.ingMeta, styles.ingMetaAdded]}>
                        {copy.adjustAdded} ·{" "}
                      </ThemedText>
                    ) : null}
                    {categoryLabelText} · {ing.amountG}g
                    {showIngredientMacros && ingKcal != null ? ` · ${ingKcal} kcal` : ""}
                    {showIngredientMacros && ingProtein != null
                      ? ` · ${ingProtein}g ${copy.adjustProteinShort}`
                      : ""}
                  </ThemedText>
                </View>

                {/* ±5g stepper */}
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => applyChange(ing.ingredientId, -5)}
                    disabled={ing.amountG <= minG}
                    style={styles.stepperButton}
                    accessibilityRole="button"
                    accessibilityLabel={copy.adjustDecrease}
                  >
                    <Minus
                      size={12}
                      color={ing.amountG <= minG ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)"}
                      strokeWidth={2.25}
                    />
                  </Pressable>
                  <ThemedText style={styles.stepperValue}>{ing.amountG}g</ThemedText>
                  <Pressable
                    onPress={() => applyChange(ing.ingredientId, 5)}
                    disabled={ing.amountG >= maxG}
                    style={styles.stepperButton}
                    accessibilityRole="button"
                    accessibilityLabel={copy.adjustIncrease}
                  >
                    <Plus
                      size={12}
                      color={ing.amountG >= maxG ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)"}
                      strokeWidth={2.25}
                    />
                  </Pressable>
                </View>

                {/* Remove */}
                <Pressable
                  onPress={() => {
                    if (isLastIngredient) return;
                    removeIngredient(ing.ingredientId);
                  }}
                  disabled={isLastIngredient}
                  style={styles.removeButton}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isLastIngredient
                      ? copy.adjustMinIngredientRequired
                      : copy.adjustRemoveIngredient(ing.name)
                  }
                >
                  <X
                    size={12}
                    color={isLastIngredient ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.4)"}
                  />
                </Pressable>
              </View>
            </Fragment>
          );
        })}
      </View>

      {/* Add-ons */}
      {availableExtras.length > 0 && (
        <>
          <View style={styles.sectionHeadRow}>
            <ThemedText style={styles.sectionHead}>
              {copy.adjustAddIngredient.toUpperCase()}
            </ThemedText>
            <ThemedText style={styles.optionalText}>{copy.adjustOptional}</ThemedText>
          </View>
          <View style={styles.extrasWrap}>
            {availableExtras.map((lib) => {
              const startG = startAmount(lib);
              const priceDelta =
                lib.customSellPricePer100g > 0
                  ? Math.round((startG / 100) * lib.customSellPricePer100g)
                  : null;
              return (
                <Pressable
                  key={lib.id}
                  onPress={() => addExtra(lib)}
                  style={({ pressed }) => [
                    styles.extraChip,
                    pressed && { backgroundColor: "rgba(232,101,10,0.14)", borderColor: "rgba(232,101,10,0.55)" },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={copy.adjustAddIngredientAria(lib.name)}
                >
                  <Plus size={11} color={colors.accent} strokeWidth={2.25} />
                  <ThemedText style={styles.extraChipText}>{lib.name}</ThemedText>
                  {priceDelta != null && priceDelta > 0 && (
                    <ThemedText style={styles.extraChipPrice}>+{priceDelta} kr</ThemedText>
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* CTA (in-flow; screen scrolls, web uses a fixed bar) */}
      <View style={styles.ctaWrap}>
        <Pressable
          onPress={() => {
            if (ctaDisabled || isClosed || !calcResult) return;
            onConfirm(ingredients, containerTypeId, calcResult);
          }}
          disabled={ctaDisabled || isClosed}
          style={[
            styles.cta,
            isClosed && styles.ctaClosed,
            ctaDisabled && !isClosed && { opacity: 0.55 },
          ]}
          accessibilityRole="button"
        >
          <ThemedText style={[styles.ctaText, isClosed && { color: "rgba(255,255,255,0.35)" }]}>
            {isClosed ? copy.mealsOrderingClosed : copy.mealsAddToCart}
          </ThemedText>
          {displayPrice != null && !isClosed && (
            <ThemedText style={styles.ctaPrice}>{displayPrice} kr</ThemedText>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing[4],
    marginHorizontal: spacing[5],
    alignSelf: "flex-start",
  },
  backLinkText: { fontSize: 12.5, color: "rgba(255,255,255,0.45)" },
  hero: { paddingHorizontal: spacing[5], paddingTop: spacing[2], paddingBottom: spacing[2] },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  stepAccent: { fontSize: 10, fontFamily: fontFamily.monoMedium, letterSpacing: 2, color: colors.accent },
  stepDot: { fontSize: 10, color: "rgba(255,255,255,0.2)" },
  stepMuted: {
    fontSize: 10,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.38)",
  },
  heroTitle: {
    fontSize: 20,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.6,
    lineHeight: 23,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  targetRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  targetLabel: { fontSize: 12, color: "rgba(255,255,255,0.35)" },
  targetValue: {
    fontSize: 12,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  summaryCard: {
    marginTop: spacing[2],
    marginHorizontal: spacing[4],
    backgroundColor: "#17171A",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingTop: spacing[3],
    paddingBottom: 10,
    overflow: "hidden",
  },
  calcLoadingText: { fontSize: 13, color: "rgba(255,255,255,0.4)" },
  calcSpinnerDot: { fontSize: 12, color: "rgba(255,255,255,0.3)" },
  summaryTopRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  summaryProteinRow: { flexDirection: "row", alignItems: "baseline", gap: spacing[2], flexWrap: "wrap", flex: 1 },
  summaryProtein: {
    fontSize: 18,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.6,
    color: colors.accent,
  },
  deltaPill: {
    backgroundColor: "rgba(44,200,120,0.12)",
    borderWidth: 1,
    borderColor: "rgba(44,200,120,0.28)",
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  deltaPillText: { fontSize: 10.5, fontFamily: fontFamily.monoMedium, letterSpacing: -0.2, color: GREEN },
  summaryPrice: {
    fontSize: 16,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  summaryMacroRow: { marginTop: 4, flexDirection: "row", alignItems: "center", gap: spacing[2] },
  summaryMacro: { fontSize: 11.5, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.7)" },
  summaryMacroUnit: { fontSize: 11.5, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.3)" },
  goalRailWrap: { marginTop: spacing[2], paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: colors.borderSoft },
  goalRail: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  goalRailFill: { height: "100%", borderRadius: 2, backgroundColor: colors.accent },
  goalRailLabels: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalRailLabel: { fontSize: 10, fontFamily: fontFamily.mono, letterSpacing: 0.2, color: "rgba(255,255,255,0.35)" },
  goalRailStrong: { fontSize: 10, fontFamily: fontFamily.monoMedium, color: "rgba(255,255,255,0.6)" },
  calcErrorText: { marginTop: spacing[2], marginHorizontal: spacing[5], fontSize: 12, color: "#f87171" },
  whyRow: { marginTop: 10, marginHorizontal: spacing[5], flexDirection: "row", gap: spacing[2] },
  whyText: { flex: 1, fontSize: 11, lineHeight: 15, color: "rgba(255,255,255,0.5)" },
  sectionHeadRow: {
    marginTop: spacing[3],
    marginBottom: 6,
    marginHorizontal: spacing[5],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHead: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    color: "rgba(255,255,255,0.3)",
  },
  macroToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(232,101,10,0.07)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  macroToggleText: { fontSize: 10.5, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  optionalText: { fontSize: 10, fontFamily: fontFamily.mono, letterSpacing: 0.5, color: "rgba(255,255,255,0.22)" },
  listCard: {
    marginHorizontal: spacing[4],
    backgroundColor: "#141416",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    overflow: "hidden",
  },
  groupHead: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 3 },
  groupHeadText: {
    fontSize: 9,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.28)",
  },
  ingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  ingRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  extraDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  ingName: {
    fontSize: 13,
    fontFamily: fontFamily.bodyMedium,
    letterSpacing: -0.2,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  ingMeta: { fontSize: 10, fontFamily: fontFamily.mono, letterSpacing: 0.1, color: "rgba(255,255,255,0.38)" },
  ingMetaAdded: { color: colors.accent, fontFamily: fontFamily.monoMedium },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    height: 28,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    overflow: "hidden",
  },
  stepperButton: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  stepperValue: {
    minWidth: 38,
    textAlign: "center",
    fontSize: 11.5,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  removeButton: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  extrasWrap: { paddingHorizontal: spacing[4], flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  extraChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(232,101,10,0.08)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.35)",
    borderRadius: 20,
    paddingVertical: 5,
    paddingLeft: 9,
    paddingRight: 11,
  },
  extraChipText: { fontSize: 11.5, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  extraChipPrice: {
    fontSize: 10,
    fontFamily: fontFamily.mono,
    color: "rgba(232,101,10,0.7)",
    marginLeft: 2,
  },
  ctaWrap: { marginTop: spacing[5], paddingHorizontal: spacing[4] },
  cta: {
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  ctaClosed: { backgroundColor: "rgba(255,255,255,0.07)", justifyContent: "center" },
  ctaText: { fontSize: 14, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  ctaPrice: { fontSize: 14, fontFamily: fontFamily.monoMedium, letterSpacing: -0.2, color: colors.textPrimary },
});
