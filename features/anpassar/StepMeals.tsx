import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Clock, Star } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import type { ApiMeal } from "@/services/api/meals";
import type { ApiIngredient } from "@/services/api/ingredients";
import type { ApiMealDistribution, MacroTargetDto } from "@/services/api/nutrition";
import type { ApiContainerType } from "@/services/api/containerTypes";
import { calculateCustomMeal, type CustomMealCalculateResponse } from "@/services/api/customMeal";
import { nutriAnpassarCopy as copy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";
import {
  optimizeIngredients,
  pickContainerId,
  SLOT_TO_MEAL_TIME_TAG,
  type OptIngredient,
  type WizardSlot,
} from "./optimizer";

export type { OptIngredient };

/**
 * Step 2 — optimized recommendations. Port of the web's
 * components/anpassar/StepMeals.tsx: filters available meals on the slot's
 * mealTimeTag, runs the client-side gram optimizer per candidate, prices/
 * verifies each through the server-authoritative POST /custom-meal/calculate
 * (Promise.allSettled — one failed candidate never sinks the list), then
 * sorts by |protein − slot target|. Card anatomy (image + badge overlays,
 * protein hero, expandable macro row, 3 ingredient chips + "+N fler", fit
 * message, Justera/Lägg-till actions, meta row) is ported 1:1.
 */

type OptimizedResult = {
  meal: ApiMeal;
  ingredients: OptIngredient[];
  containerTypeId: string;
  calcResult: CustomMealCalculateResponse;
};

interface Props {
  slot: WizardSlot;
  slotTarget: ApiMealDistribution;
  /** Total remainingToday (uncapped, can be negative). UI status line only. */
  remainingTotal: MacroTargetDto | null;
  allMeals: ApiMeal[];
  ingredientLibrary: ApiIngredient[];
  containerTypes: ApiContainerType[];
  isClosed: boolean;
  onSelect: (
    meal: ApiMeal,
    ingredients: OptIngredient[],
    containerTypeId: string,
    calcResult: CustomMealCalculateResponse
  ) => void;
  onAdjust: (
    meal: ApiMeal,
    ingredients: OptIngredient[],
    containerTypeId: string,
    calcResult: CustomMealCalculateResponse
  ) => void;
  onBack: () => void;
}

export function StepMeals({
  slot,
  slotTarget,
  remainingTotal,
  allMeals,
  ingredientLibrary,
  containerTypes,
  isClosed,
  onSelect,
  onAdjust,
  onBack,
}: Props) {
  const slotName = copy.slotNames[slot] ?? slot;
  const [results, setResults] = useState<OptimizedResult[]>([]);
  const [optimizing, setOptimizing] = useState(true);
  const [expandedMacroMealIds, setExpandedMacroMealIds] = useState<Set<string>>(new Set());
  const [imageFailedIds, setImageFailedIds] = useState<Record<string, boolean>>({});

  function toggleMacros(mealId: string) {
    setExpandedMacroMealIds((prev) => {
      const next = new Set(prev);
      if (next.has(mealId)) next.delete(mealId);
      else next.add(mealId);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const tag = SLOT_TO_MEAL_TIME_TAG[slot];
      const candidates = allMeals.filter((m) => m.available && m.mealTimeTags.includes(tag));

      const settled = await Promise.allSettled(
        candidates.map(async (meal): Promise<OptimizedResult | null> => {
          const ingredients = optimizeIngredients(meal.ingredients, ingredientLibrary, slotTarget);
          if (ingredients.length === 0) return null;

          const totalWeight = ingredients.reduce((s, i) => s + i.amountG, 0);
          const containerTypeId = pickContainerId(containerTypes, totalWeight);
          if (!containerTypeId) return null;

          const calcResult = await calculateCustomMeal({
            containerTypeId,
            items: ingredients.map((i) => ({ ingredientId: i.ingredientId, grams: i.amountG })),
          });

          return { meal, ingredients, containerTypeId, calcResult };
        })
      );

      if (cancelled) return;

      const valid = settled
        .flatMap((r): OptimizedResult[] =>
          r.status === "fulfilled" && r.value !== null ? [r.value] : []
        )
        .sort(
          (a, b) =>
            Math.abs(a.calcResult.totalProteinG - slotTarget.proteinG) -
            Math.abs(b.calcResult.totalProteinG - slotTarget.proteinG)
        );

      setResults(valid);
      setOptimizing(false);
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Status line — based on whole-day remainingToday, not the slot share.
  const statusLine = (() => {
    if (remainingTotal && remainingTotal.calories <= 0 && remainingTotal.proteinG <= 0) {
      return { text: copy.remainingGoalReachedTitle, color: "rgb(90,210,140)" };
    }
    if (remainingTotal && remainingTotal.calories > 0 && remainingTotal.calories < 200) {
      return { text: copy.mealsNearGoal, color: "rgba(255,255,255,0.45)" };
    }
    return null;
  })();

  return (
    <View>
      {/* Change-meal link */}
      <Pressable onPress={onBack} style={styles.backLink} accessibilityRole="button">
        <ArrowLeft size={12} color="rgba(255,255,255,0.45)" strokeWidth={2} />
        <ThemedText style={styles.backLinkText}>{copy.mealsChangeMeal}</ThemedText>
      </Pressable>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.stepRow}>
          <ThemedText style={styles.stepAccent}>{copy.step2.toUpperCase()}</ThemedText>
          <ThemedText style={styles.stepDot}>·</ThemedText>
          <ThemedText style={styles.stepMuted}>{slotName.toUpperCase()}</ThemedText>
        </View>
        <ThemedText style={styles.heroTitle}>{copy.mealsHeroTitle}</ThemedText>
        {statusLine ? (
          <ThemedText style={[styles.statusLine, { color: statusLine.color }]}>
            {statusLine.text}
          </ThemedText>
        ) : (
          <View style={styles.targetRow}>
            <ThemedText style={styles.targetLabel}>{copy.targetLabel}</ThemedText>
            <ThemedText style={styles.targetValue}>{slotTarget.calories} kcal</ThemedText>
            <View style={styles.macroDot} />
            <ThemedText style={styles.targetValue}>{slotTarget.proteinG}g protein</ThemedText>
          </View>
        )}
      </View>

      {/* Why-line */}
      {!optimizing && results.length > 0 && (
        <View style={styles.whyRow}>
          <View style={styles.whyIcon}>
            <Star size={9} color={colors.accent} strokeWidth={1} fill="rgba(232,101,10,0.25)" />
          </View>
          <ThemedText style={styles.whyText}>
            {copy.mealsWhy(copy.optionWords[slot] ?? slot)}
          </ThemedText>
        </View>
      )}

      {/* Loading */}
      {optimizing && (
        <View style={styles.loading}>
          <LoadingIndicator label={copy.mealsLoading} />
        </View>
      )}

      {/* Empty state */}
      {!optimizing && results.length === 0 && (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.emptyTitle}>{copy.mealsEmptyTitle(slotName)}</ThemedText>
          <ThemedText style={styles.emptyBody}>{copy.mealsEmptyBody}</ThemedText>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.emptyCta, pressed && { backgroundColor: colors.accentHover }]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.emptyCtaText}>{copy.mealsEmptyCta}</ThemedText>
          </Pressable>
        </View>
      )}

      {/* Results */}
      {!optimizing && results.length > 0 && (
        <View style={styles.resultsList}>
          {results.map(({ meal, ingredients, containerTypeId, calcResult }) => {
            const displayPrice = Math.round(calcResult.totalPriceOre / 100);
            const displayProtein = Math.round(calcResult.totalProteinG);
            const displayCalories = Math.round(calcResult.totalKcal);
            const displayCarbs = Math.round(calcResult.totalCarbsG);
            const displayFat = Math.round(calcResult.totalFatG);

            const proteinDelta = displayProtein - slotTarget.proteinG;
            const isPerfectMatch = Math.abs(proteinDelta) <= 3;
            const matchLabel = (() => {
              const abs = Math.abs(proteinDelta);
              if (abs <= 5) return copy.matchClose;
              if (abs <= 10) return copy.matchGood;
              return copy.matchBest;
            })();

            const visibleChips = ingredients.slice(0, 3);
            const extraCount = ingredients.length - visibleChips.length;
            const isMacroExpanded = expandedMacroMealIds.has(meal.id);

            return (
              <View key={meal.id} style={styles.card}>
                {/* Image + overlays */}
                <View style={styles.imageWrap}>
                  {!imageFailedIds[meal.id] && meal.image ? (
                    <Image
                      source={{ uri: meal.image }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                      onError={() => setImageFailedIds((p) => ({ ...p, [meal.id]: true }))}
                      accessibilityLabel={meal.name}
                    />
                  ) : (
                    <View style={styles.imagePlaceholder} />
                  )}
                  <View style={styles.badgeBest}>
                    <Star size={8} color={colors.textPrimary} fill={colors.textPrimary} />
                    <ThemedText style={styles.badgeBestText}>
                      {copy.mealsBestForGoal.toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={styles.badgeMatch}>
                    <ThemedText style={styles.badgeMatchText}>{matchLabel}</ThemedText>
                  </View>
                </View>

                {/* Name */}
                <ThemedText style={styles.mealName}>{meal.name}</ThemedText>

                {/* Protein hero */}
                <View style={styles.proteinHeroRow}>
                  <ThemedText style={styles.proteinHeroValue}>{displayProtein}g</ThemedText>
                  <ThemedText style={styles.proteinHeroLabel}>
                    {copy.protein.toUpperCase()}
                  </ThemedText>
                </View>

                {/* Macro row + toggle */}
                <View style={styles.macroRow}>
                  <ThemedText style={styles.macroKcal}>
                    {displayCalories}
                    <ThemedText style={styles.macroUnit}> kcal</ThemedText>
                  </ThemedText>
                  {isMacroExpanded ? (
                    <>
                      <ThemedText style={styles.macroSep}>·</ThemedText>
                      <ThemedText style={styles.macroVal}>
                        {displayCarbs}g<ThemedText style={styles.macroUnit}> {copy.carbsShort}</ThemedText>
                      </ThemedText>
                      <ThemedText style={styles.macroSep}>·</ThemedText>
                      <ThemedText style={styles.macroVal}>
                        {displayFat}g<ThemedText style={styles.macroUnit}> {copy.fatShort}</ThemedText>
                      </ThemedText>
                      <Pressable
                        onPress={() => toggleMacros(meal.id)}
                        accessibilityRole="button"
                        accessibilityLabel={copy.mealsHideMacrosAria}
                        style={{ padding: 2 }}
                      >
                        <ChevronUp size={11} color="rgba(255,255,255,0.25)" strokeWidth={1.5} />
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      onPress={() => toggleMacros(meal.id)}
                      style={styles.macroToggle}
                      accessibilityRole="button"
                    >
                      <ThemedText style={styles.macroToggleText}>{copy.mealsMacros}</ThemedText>
                      <ChevronDown size={9} color={colors.accent} strokeWidth={1.4} />
                    </Pressable>
                  )}
                </View>

                {/* Ingredient chips */}
                <View style={styles.chipRow}>
                  {visibleChips.map((ing) => (
                    <View key={ing.ingredientId} style={styles.chip}>
                      <ThemedText style={styles.chipText}>
                        {ing.name} {ing.amountG}g
                      </ThemedText>
                    </View>
                  ))}
                  {extraCount > 0 && (
                    <View style={[styles.chip, styles.chipDashed]}>
                      <ThemedText style={[styles.chipText, { color: "rgba(255,255,255,0.4)" }]}>
                        +{extraCount} {copy.mealsMore}
                      </ThemedText>
                    </View>
                  )}
                </View>

                {/* Fit message */}
                {(isPerfectMatch || Math.abs(proteinDelta) > 5) && (
                  <View style={styles.fitBox}>
                    <Check size={13} color="rgb(90,210,140)" strokeWidth={1.6} />
                    <ThemedText style={styles.fitText}>
                      {isPerfectMatch ? copy.mealsInGoal : copy.mealsBestPossible}
                    </ThemedText>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => onAdjust(meal, ingredients, containerTypeId, calcResult)}
                    style={({ pressed }) => [
                      styles.adjustButton,
                      pressed && { backgroundColor: "rgba(255,255,255,0.11)" },
                    ]}
                    accessibilityRole="button"
                  >
                    <ThemedText style={styles.adjustButtonText}>{copy.mealsAdjust}</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => onSelect(meal, ingredients, containerTypeId, calcResult)}
                    disabled={isClosed}
                    style={[styles.addButton, isClosed && styles.addButtonClosed]}
                    accessibilityRole="button"
                  >
                    <ThemedText
                      style={[styles.addButtonText, isClosed && { color: "rgba(255,255,255,0.35)" }]}
                    >
                      {isClosed ? copy.mealsOrderingClosed : copy.mealsAddToCart}
                    </ThemedText>
                    {!isClosed && (
                      <ThemedText style={styles.addButtonPrice}>{displayPrice} kr</ThemedText>
                    )}
                  </Pressable>
                </View>

                {/* Meta row */}
                <View style={styles.metaRow}>
                  <Clock size={10} color="rgba(255,255,255,0.38)" strokeWidth={1.5} />
                  <ThemedText style={styles.metaText}>{copy.mealsReadyIn}</ThemedText>
                  <View style={styles.macroDot} />
                  <ThemedText style={styles.metaText}>{matchLabel}</ThemedText>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 32 }} />
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
  hero: { paddingHorizontal: spacing[5], paddingTop: spacing[2], paddingBottom: spacing[1] },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing[2] },
  stepAccent: {
    fontSize: 10,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 2,
    color: colors.accent,
  },
  stepDot: { fontSize: 10, color: "rgba(255,255,255,0.2)" },
  stepMuted: {
    fontSize: 10,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.38)",
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.8,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  statusLine: { fontSize: 12.5 },
  targetRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  targetLabel: { fontSize: 12.5, color: "rgba(255,255,255,0.35)" },
  targetValue: {
    fontSize: 12.5,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  macroDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  whyRow: {
    marginTop: spacing[2],
    marginHorizontal: spacing[5],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  whyIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(232,101,10,0.15)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  whyText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: "rgba(255,255,255,0.52)" },
  loading: { marginTop: spacing[10], alignItems: "center" },
  emptyCard: {
    marginTop: spacing[6],
    marginHorizontal: spacing[4],
    backgroundColor: "#17171A",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[6],
    alignItems: "center",
  },
  emptyTitle: {
    textAlign: "center",
    fontSize: 15,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
    marginBottom: spacing[2],
  },
  emptyBody: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: "rgba(255,255,255,0.45)",
    marginBottom: spacing[5],
  },
  emptyCta: {
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
  },
  emptyCtaText: { fontSize: 14, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  resultsList: { marginTop: spacing[3], marginHorizontal: spacing[4], gap: 14 },
  card: {
    backgroundColor: "#17171A",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  imageWrap: { height: 160, backgroundColor: colors.cardAlt },
  imagePlaceholder: { flex: 1, backgroundColor: colors.cardAlt },
  badgeBest: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(232,101,10,0.92)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeBestText: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  badgeMatch: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.48)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeMatchText: { fontSize: 9.5, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.82)" },
  mealName: {
    paddingHorizontal: 14,
    paddingTop: spacing[2],
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.3,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  proteinHeroRow: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing[2],
  },
  proteinHeroValue: {
    fontSize: 36,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -1.5,
    lineHeight: 40,
    color: colors.textPrimary,
  },
  proteinHeroLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  macroRow: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  macroKcal: { fontSize: 12, fontFamily: fontFamily.monoMedium, color: "rgba(255,255,255,0.85)" },
  macroVal: { fontSize: 12, fontFamily: fontFamily.monoMedium, color: "rgba(255,255,255,0.65)" },
  macroUnit: { fontSize: 10.5, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.32)" },
  macroSep: { fontSize: 12, color: "rgba(255,255,255,0.18)" },
  macroToggle: { flexDirection: "row", alignItems: "center", gap: 3 },
  macroToggleText: {
    fontSize: 11,
    fontFamily: fontFamily.monoMedium,
    color: colors.accent,
    opacity: 0.8,
  },
  chipRow: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipDashed: { backgroundColor: "transparent", borderStyle: "dashed" },
  chipText: { fontSize: 11.5, color: "rgba(255,255,255,0.7)" },
  fitBox: {
    marginHorizontal: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: "rgba(90,210,140,0.08)",
    borderWidth: 1,
    borderColor: "rgba(90,210,140,0.22)",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  fitText: { flex: 1, fontSize: 12, fontFamily: fontFamily.bodyMedium, color: "rgba(180,240,200,0.95)" },
  actions: {
    flexDirection: "row",
    gap: spacing[2],
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  adjustButton: {
    width: 96,
    height: 42,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  adjustButtonText: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  addButton: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
  },
  addButtonClosed: { backgroundColor: "rgba(255,255,255,0.07)", justifyContent: "center" },
  addButtonText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  addButtonPrice: {
    fontSize: 13.5,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  metaText: { fontSize: 10.5, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.38)" },
});
