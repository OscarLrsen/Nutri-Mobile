import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { AlertCircle, Check, ChevronLeft, Clock, ShoppingCart } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/services/auth/AuthProvider";
import { useOnboardingStatus } from "@/services/auth/useOnboardingStatus";
import { getMeals, type ApiMeal } from "@/services/api/meals";
import { getIngredients, type ApiIngredient } from "@/services/api/ingredients";
import { getContainerTypes, type ApiContainerType } from "@/services/api/containerTypes";
import { getTodayNutrition, type ApiMealDistribution } from "@/services/api/nutrition";
import { SLOT_TO_MEAL_TIME_TAG, type WizardSlot } from "@/features/anpassar/optimizer";
import { OnboardingGate } from "@/features/anpassar/NutriAnpassarScreen";
import { apiMealToMeal } from "@/utils/pricing";
import { env } from "@/lib/env";
import { heldagCopy as copy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";
import {
  buildFixedSlotResult,
  buildFixedSlotResultForMeal,
  buildSlotResult,
  buildSlotResultForMeal,
  deriveTargets,
  getPackageWindowState,
  getStockholmHour,
  isPackageAvailable,
  SLOT_SERVES,
  SLOTS,
  type SlotResult,
} from "./heldagBuilder";

/**
 * Heldagsmåltid — port of the web's src/app/heldag/page.tsx. Same flow:
 * gate (login → onboarding-complete) → parallel load (today-nutrition,
 * meals, ingredients, containers) → sequential slot builds (Lunch optimized,
 * Mellanmål fixed cheapest, Middag optimized excluding Lunch's meal) →
 * summary + slot cards with inline swap → sticky CTA that adds all three
 * package lines to the SHARED cart and navigates to the cart.
 *
 * Cart lines are added with the exact argument tuple the web passes
 * (customMacros, customIngredients, ingredientSurchargeKr, containerTypeId,
 * slot, slot-prefixed originalMealName) so an order built here serializes
 * identically to one built on the web.
 *
 * Adaptations (documented, not guessed):
 * - Login guard: replace() to /logga-in with next=/heldag — the web reaches
 *   /heldag only via logged-in surfaces; deep mobile entry needs the guard
 *   (same pattern as NutriAnpassarScreen).
 * - Onboarding gate primary opens the WEB /onboarding (no mobile wizard) —
 *   same handoff NutriAnpassarScreen uses.
 * - Profile-error CTA goes to the in-app profile tab (web links /profil;
 *   mobile has had a native profile since Feature 10).
 * - sv-only: the web's localizedIngredientName reduces to the ingredient's
 *   own (Swedish) name, and slot labels equal the WizardSlot literals.
 * - The web's radial-gradient hero/backdrops are approximated with linear
 *   gradients + static glow circles (same simplification as the rest of the
 *   app's ports).
 */

const SURFACE = "#16161A";
const HAIRLINE = "rgba(255,255,255,0.06)";
const TEXT_DIM = "rgba(255,255,255,0.62)";
const TEXT_MUTE = "rgba(255,255,255,0.34)";

export function HeldagScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addItem } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { loading: profileLoading, isOnboardingComplete } = useOnboardingStatus();
  const needsGate = !authLoading && !profileLoading && !!user && isOnboardingComplete !== true;

  const [results, setResults] = useState<SlotResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<null | "profile" | "network">(null);
  const [adding, setAdding] = useState(false);
  const [loadedMeals, setLoadedMeals] = useState<ApiMeal[]>([]);
  const [loadedLibrary, setLoadedLibrary] = useState<ApiIngredient[]>([]);
  const [loadedContainers, setLoadedContainers] = useState<ApiContainerType[]>([]);
  const [loadedTargets, setLoadedTargets] = useState<Record<WizardSlot, ApiMealDistribution> | null>(null);
  const [swappingSlot, setSwappingSlot] = useState<WizardSlot | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);

  // Logged-out deep entry → login with return path (anpassar pattern).
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace({ pathname: "/logga-in", params: { next: "/heldag" } });
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user || needsGate || profileLoading) return;
    let cancelled = false;
    async function run() {
      try {
        const [today, meals, library, containers] = await Promise.all([
          getTodayNutrition(),
          getMeals(),
          getIngredients(),
          getContainerTypes(),
        ]);
        if (cancelled) return;
        if (!today || !today.adjustedTarget || today.adjustedTarget.calories <= 0) {
          setErrorKind("profile");
          setLoading(false);
          return;
        }
        setLoadedMeals(meals);
        setLoadedLibrary(library);
        setLoadedContainers(containers);
        const targets = deriveTargets(today);
        setLoadedTargets(targets);
        // Run sequentially so each slot can exclude already-chosen meal IDs
        const usedMealIds = new Set<string>();
        const lunchResult = await buildSlotResult("Lunch", targets["Lunch"], meals, library, containers, usedMealIds);
        if (lunchResult.status === "ready") usedMealIds.add(lunchResult.meal.id);
        // Mellanmål is a fixed product — no optimizer, base gram amounts
        const snackResult = await buildFixedSlotResult("Mellanmål", targets["Mellanmål"], meals, containers);
        const dinnerResult = await buildSlotResult("Middag", targets["Middag"], meals, library, containers, usedMealIds);
        const slotResults = [lunchResult, snackResult, dinnerResult];
        if (cancelled) return;
        setResults(slotResults);
      } catch (e) {
        if (cancelled) return;
        // Web classifies on the thrown "API <status>" message; the mobile
        // interceptor normalizes to ApiError{status} — same outcomes.
        const status =
          e && typeof e === "object" && "status" in e ? (e as { status: number }).status : null;
        const notAuthenticated = e instanceof Error && /not authenticated/i.test(e.message);
        if (status === 401 || status === 404 || notAuthenticated) {
          setErrorKind("profile");
        } else {
          setErrorKind("network");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, needsGate, profileLoading]);

  const totals = useMemo(() => {
    if (!results) return null;
    let kcal = 0,
      protein = 0,
      kr = 0;
    let readyCount = 0;
    for (const r of results) {
      if (r.status === "ready") {
        kcal += r.customMacros.calories;
        protein += r.customMacros.proteinG;
        kr += Math.round(r.calcResult.totalPriceOre / 100);
        readyCount++;
      }
    }
    return { kcal, protein, kr, readyCount };
  }, [results]);

  const allReady = !!results && results.every((r) => r.status === "ready");

  function candidatesFor(slot: WizardSlot): ApiMeal[] {
    const tag = SLOT_TO_MEAL_TIME_TAG[slot];
    return loadedMeals.filter((m) => m.available !== false && m.mealTimeTags?.includes(tag));
  }

  async function handleSwap(slot: WizardSlot, newMeal: ApiMeal) {
    if (!results) return;
    setSwapLoading(true);
    const existing = results.find((r) => r.slot === slot);
    if (!existing) {
      setSwapLoading(false);
      return;
    }

    // Lunch / Middag swap: re-optimize with the same slot target, no recalc elsewhere
    if (slot !== "Mellanmål") {
      const newResult = await buildSlotResultForMeal(slot, existing.target, newMeal, loadedLibrary, loadedContainers);
      setResults((prev) => (prev ? prev.map((r) => (r.slot === slot ? newResult : r)) : prev));
      setSwappingSlot(null);
      setSwapLoading(false);
      return;
    }

    // Mellanmål swap: build fixed snack, then redistribute delta to Lunch + Middag
    const newSnackResult = await buildFixedSlotResultForMeal(slot, existing.target, newMeal, loadedContainers);

    if (newSnackResult.status === "ready" && loadedTargets) {
      const ST = loadedTargets["Mellanmål"]; // original snack budget
      const LT = loadedTargets["Lunch"];
      const DT = loadedTargets["Middag"];
      const lunchDinnerBudget = LT.calories + DT.calories;

      if (lunchDinnerBudget > 0) {
        const snack = newSnackResult.customMacros;
        const lunchShare = LT.calories / lunchDinnerBudget;
        const adjTarget = (original: ApiMealDistribution, share: number): ApiMealDistribution => ({
          ...original,
          calories: Math.round(original.calories + (ST.calories - snack.calories) * share),
          proteinG: Math.round(original.proteinG + (ST.proteinG - snack.proteinG) * share),
          carbsG: Math.round(original.carbsG + (ST.carbsG - snack.carbsG) * share),
          fatG: Math.round(original.fatG + (ST.fatG - snack.fatG) * share),
        });

        const newLunchTarget = adjTarget(LT, lunchShare);
        const newDinnerTarget = adjTarget(DT, 1 - lunchShare);

        const usedIds = new Set<string>();
        const newLunchResult = await buildSlotResult("Lunch", newLunchTarget, loadedMeals, loadedLibrary, loadedContainers, usedIds);
        if (newLunchResult.status === "ready") usedIds.add(newLunchResult.meal.id);
        const newDinnerResult = await buildSlotResult("Middag", newDinnerTarget, loadedMeals, loadedLibrary, loadedContainers, usedIds);

        setResults([newLunchResult, newSnackResult, newDinnerResult]);
        setSwappingSlot(null);
        setSwapLoading(false);
        return;
      }
    }

    // Fallback: snack missing/error or no targets — update snack slot only
    setResults((prev) => (prev ? prev.map((r) => (r.slot === "Mellanmål" ? newSnackResult : r)) : prev));
    setSwappingSlot(null);
    setSwapLoading(false);
  }

  function addOne(r: SlotResult) {
    if (r.status !== "ready") return;
    // Slot-prefixed display name so the cart and kitchen see one clear package line per meal.
    const originalMealName = `${r.slot} · ${copy.packageKitchenName} · ${r.meal.name}`;
    addItem(
      apiMealToMeal(r.meal),
      "medium",
      1,
      r.customMacros,
      r.customIngredients,
      r.ingredientSurchargeKr,
      r.containerTypeId,
      r.slot,
      originalMealName
    );
  }

  function addWholeDay() {
    if (!results || !allReady || adding || !isPackageAvailable(getStockholmHour())) return;
    setAdding(true);
    for (const r of results) addOne(r);
    router.push("/(tabs)/varukorg");
  }

  // Computed per render for CTA gate
  const swHour = getStockholmHour();
  const available = isPackageAvailable(swHour);
  const windowState = getPackageWindowState(swHour);
  const ctaLabel = available ? copy.ctaOrder : windowState === "after" ? copy.ctaAfter : copy.ctaBefore;

  const handleBack = () => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"));

  /* ── Guards & states ── */

  if (authLoading || !user) {
    return <View style={styles.root} />;
  }
  if (needsGate) {
    return (
      <OnboardingGate
        onPrimary={() => Linking.openURL(`${env.EXPO_PUBLIC_WEB_URL}/onboarding`).catch(() => {})}
        onSecondary={() => router.navigate("/(tabs)/meny")}
      />
    );
  }
  if (loading || profileLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <LoadingIndicator />
        <ThemedText style={styles.loadingText}>{copy.loadingPackage}</ThemedText>
      </View>
    );
  }
  if (errorKind === "profile") {
    return (
      <View style={styles.root}>
        <HeldagHeader onBack={handleBack} insetsTop={insets.top} />
        <View style={[styles.center, { flex: 1, paddingHorizontal: spacing[6] }]}>
          <ThemedText style={styles.errorEmoji}>🥗</ThemedText>
          <ThemedText style={styles.errorTitle}>{copy.errorProfileTitle}</ThemedText>
          <ThemedText style={styles.errorBody}>{copy.errorProfileBody}</ThemedText>
          <Pressable
            onPress={() => router.navigate("/(tabs)/konto")}
            style={({ pressed }) => [styles.errorCta, pressed && { backgroundColor: colors.accentHover }]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.errorCtaText}>{copy.errorProfileCta}</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }
  if (errorKind === "network" || !results) {
    return (
      <View style={styles.root}>
        <HeldagHeader onBack={handleBack} insetsTop={insets.top} />
        <View style={[styles.center, { flex: 1, paddingHorizontal: spacing[6] }]}>
          <AlertCircle size={28} color={colors.accent} />
          <ThemedText style={[styles.errorBody, { marginTop: spacing[3] }]}>
            {copy.errorNetwork}
          </ThemedText>
        </View>
      </View>
    );
  }

  /* ── Main ── */

  return (
    <View style={styles.root}>
      <HeldagHeader onBack={handleBack} insetsTop={insets.top} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 132 }}
      >
        {/* HERO */}
        <View style={styles.hero}>
          <View style={styles.heroGlow} pointerEvents="none" />
          <LinearGradient
            colors={["rgba(12,12,14,0.45)", "rgba(12,12,14,0)", "rgba(12,12,14,0.85)", colors.bgDeep]}
            locations={[0, 0.28, 0.88, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <View style={styles.heroBadgeDot} />
              <ThemedText style={styles.heroBadgeText}>{copy.badge}</ThemedText>
            </View>
            <ThemedText style={styles.heroTitle}>
              {copy.heroTitle1}
              {"\n"}
              {copy.heroTitle2}
            </ThemedText>
          </View>
        </View>

        {/* HERO TEXT */}
        <View style={styles.heroTextWrap}>
          <ThemedText style={styles.heroBodyText}>
            {copy.heroBodyPrefix} <ThemedText style={styles.heroBodyStrong}>{copy.heroBodyStrong}</ThemedText>
          </ThemedText>
          <ThemedText style={styles.heroNote}>{copy.heroNote}</ThemedText>
        </View>

        {/* Info note (availability window) */}
        <View style={styles.infoNote}>
          <View style={styles.infoNoteIcon}>
            <Clock size={14} color={colors.accent} />
          </View>
          <ThemedText style={styles.infoNoteText}>
            {windowState === "after" ? (
              <>
                {copy.availabilityAfterPrefix}{" "}
                <ThemedText style={styles.infoNoteStrong}>{copy.availabilityAfterTime}</ThemedText>.{" "}
                {copy.availabilitySuffix}
              </>
            ) : (
              <>
                {copy.availabilityBeforePrefix}{" "}
                <ThemedText style={styles.infoNoteStrong}>{copy.availabilityBeforeTime}</ThemedText>.{" "}
                {copy.availabilitySuffix}
              </>
            )}
          </ThemedText>
        </View>

        {/* SUMMARY — Din dag */}
        <View style={styles.sectionHeadRow}>
          <ThemedText style={styles.sectionHead}>{copy.summaryDay}</ThemedText>
          <ThemedText style={styles.sectionHeadMeta}>{copy.summaryOverview}</ThemedText>
        </View>

        {totals && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryGlow} pointerEvents="none" />
            <View style={styles.summaryHeadRow}>
              <ThemedText style={styles.summaryHeadLabel}>{copy.summaryPackage}</ThemedText>
              <View style={styles.readyBadge}>
                <View style={styles.readyBadgeCheck}>
                  <Check size={7} strokeWidth={3} color="#fff" />
                </View>
                <ThemedText style={styles.readyBadgeText}>
                  {copy.summaryReady(totals.readyCount, SLOTS.length)}
                </ThemedText>
              </View>
            </View>
            <View style={styles.summaryGrid}>
              <SummaryCell label={copy.summaryKcalTotal} value={totals.kcal.toLocaleString("sv-SE")} accent />
              <SummaryCell label={copy.summaryProtein} value={String(totals.protein)} unit="g" valueColor={colors.accent} />
              <SummaryCell label={copy.summaryMeals} value={String(SLOTS.length)} unit={copy.unitCount} accent />
              <SummaryCell label={copy.summaryPrice} value={String(totals.kr)} unit="kr" />
            </View>
          </View>
        )}

        {/* SLOT CARDS */}
        <View style={styles.sectionHeadRow}>
          <ThemedText style={styles.sectionHead}>{copy.slotSectionTitle}</ThemedText>
          <ThemedText style={styles.sectionHeadMeta}>
            {SLOTS.length} {copy.unitCount}
          </ThemedText>
        </View>

        <View style={{ paddingHorizontal: spacing[4], gap: 14 }}>
          {results.map((r) => (
            <SlotCard
              key={r.slot}
              result={r}
              candidates={candidatesFor(r.slot)}
              swapping={swappingSlot === r.slot}
              swapLoading={swapLoading && swappingSlot === r.slot}
              onSwapOpen={() => setSwappingSlot(r.slot)}
              onSwapClose={() => setSwappingSlot(null)}
              onSwapPick={(meal) => handleSwap(r.slot, meal)}
            />
          ))}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <LinearGradient
        colors={["rgba(12,12,14,0)", "rgba(12,12,14,0.78)", colors.bgDeep, colors.bgDeep]}
        locations={[0, 0.4, 0.8, 1]}
        style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}
      >
        <Pressable
          onPress={addWholeDay}
          disabled={!allReady || adding || !available}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          style={[
            styles.cta,
            available ? styles.ctaAvailable : styles.ctaClosed,
            available && (!allReady || adding) && { opacity: 0.45 },
          ]}
        >
          <View style={styles.ctaLeft}>
            {adding ? (
              <LoadingIndicator />
            ) : available ? (
              <ShoppingCart size={16} color="#fff" style={{ opacity: 0.92 }} />
            ) : (
              <Clock size={16} color="rgba(255,255,255,0.62)" style={{ opacity: 0.7 }} />
            )}
            <ThemedText style={[styles.ctaText, !available && styles.ctaTextClosed]}>
              {ctaLabel}
            </ThemedText>
          </View>
          {available && (
            <ThemedText style={styles.ctaPrice}>{totals ? totals.kr : 0} kr</ThemedText>
          )}
        </Pressable>
        {available && !allReady && (
          <ThemedText style={styles.ctaNotReady}>{copy.ctaNotReady}</ThemedText>
        )}
      </LinearGradient>
    </View>
  );
}

/* ── Header (web HeldagHeader: back + centered logo) ────────── */

function HeldagHeader({ onBack, insetsTop }: { onBack: () => void; insetsTop: number }) {
  return (
    <View style={[styles.header, { paddingTop: insetsTop + 10 }]}>
      <Pressable
        onPress={onBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Tillbaka"
        hitSlop={8}
      >
        <ChevronLeft size={18} color="#fff" />
      </Pressable>
      <Image
        source={require("@/assets/nutri-logo.png")}
        style={styles.headerLogo}
        contentFit="contain"
        accessibilityLabel="Nutri"
      />
      <View style={styles.backButton} />
    </View>
  );
}

/* ── Summary cell ──────────────────────────────────────── */

function SummaryCell({
  label,
  value,
  unit,
  accent,
  valueColor,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  valueColor?: string;
}) {
  return (
    <View
      style={[
        styles.summaryCell,
        { borderLeftColor: accent ? "rgba(232,101,10,0.45)" : "rgba(255,255,255,0.08)" },
      ]}
    >
      <ThemedText style={styles.summaryCellLabel}>{label}</ThemedText>
      <ThemedText style={[styles.summaryCellValue, valueColor ? { color: valueColor } : null]}>
        {value}
        {unit ? <ThemedText style={styles.summaryCellUnit}> {unit}</ThemedText> : null}
      </ThemedText>
    </View>
  );
}

/* ── Slot card ──────────────────────────────────────────── */

function SlotCard({
  result,
  candidates,
  swapping,
  swapLoading,
  onSwapOpen,
  onSwapClose,
  onSwapPick,
}: {
  result: SlotResult;
  candidates: ApiMeal[];
  swapping: boolean;
  swapLoading: boolean;
  onSwapOpen: () => void;
  onSwapClose: () => void;
  onSwapPick: (meal: ApiMeal) => void;
}) {
  const target = result.target;

  if (result.status === "missing") {
    return (
      <View style={styles.slotCard}>
        <SlotImage slot={result.slot} target={target} image={undefined} />
        <View style={{ padding: spacing[4] }}>
          <ThemedText style={styles.slotMissingText}>{copy.slotMissing}</ThemedText>
        </View>
      </View>
    );
  }

  if (result.status === "error") {
    return (
      <View style={styles.slotCard}>
        <SlotImage slot={result.slot} target={target} image={undefined} />
        <View style={{ padding: spacing[4] }}>
          <ThemedText style={styles.slotErrorText}>
            {result.reason === "noContainer" ? copy.errorNoContainer : copy.errorCalculateMeal}
          </ThemedText>
        </View>
      </View>
    );
  }

  const priceKr = Math.round(result.calcResult.totalPriceOre / 100);
  const image = result.meal.image && result.meal.image.trim().length > 0 ? result.meal.image : undefined;

  return (
    <View style={styles.slotCard}>
      <SlotImage slot={result.slot} target={target} image={image} />

      <View style={styles.slotBody}>
        <View style={styles.slotTitleRow}>
          <ThemedText style={styles.slotMealName}>{result.meal.name}</ThemedText>
          <ThemedText style={styles.slotPrice}>
            {priceKr}
            <ThemedText style={styles.slotPriceUnit}> kr</ThemedText>
          </ThemedText>
        </View>

        <View style={styles.slotMacroRow}>
          <ThemedText style={styles.slotMacroProtein}>
            {result.customMacros.proteinG}g protein
          </ThemedText>
          <MacroDot />
          <ThemedText style={styles.slotMacroText}>{result.customMacros.calories} kcal</ThemedText>
          <MacroDot />
          <ThemedText style={styles.slotMacroText}>
            {result.customMacros.carbsG}g {copy.macroCarbsShort}
          </ThemedText>
          <MacroDot />
          <ThemedText style={styles.slotMacroText}>
            {result.customMacros.fatG}g {copy.macroFatShort}
          </ThemedText>
        </View>

        <View style={styles.slotChips}>
          {result.optimizedIngredients.map((ing) => (
            <View key={ing.ingredientId} style={styles.slotChip}>
              <ThemedText style={styles.slotChipText}>
                {ing.name}{" "}
                <ThemedText style={styles.slotChipGrams}>{ing.amountG}g</ThemedText>
              </ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.slotFooter}>
          <View style={styles.includedRow}>
            <View style={styles.includedCheck}>
              <Check size={7} strokeWidth={3} color={colors.accent} />
            </View>
            <ThemedText style={styles.includedText}>{copy.slotIncluded}</ThemedText>
          </View>
          <Pressable
            onPress={swapping ? onSwapClose : onSwapOpen}
            accessibilityRole="button"
            hitSlop={6}
          >
            <ThemedText style={[styles.swapToggle, swapping && { color: "rgba(255,255,255,0.35)" }]}>
              {swapping ? copy.slotClose : copy.slotChange}
            </ThemedText>
          </Pressable>
        </View>

        {/* Inline swap picker */}
        {swapping && (
          <View style={styles.swapPanel}>
            <ThemedText style={styles.swapPanelHead}>{copy.slotChoose}</ThemedText>
            {swapLoading ? (
              <View style={{ alignItems: "center", paddingVertical: spacing[2] }}>
                <LoadingIndicator />
              </View>
            ) : candidates.length === 0 ? (
              <ThemedText style={styles.swapEmpty}>{copy.slotNoOptions}</ThemedText>
            ) : (
              <View style={{ gap: 6 }}>
                {candidates.map((meal) => (
                  <Pressable
                    key={meal.id}
                    onPress={() => onSwapPick(meal)}
                    style={({ pressed }) => [
                      styles.swapOption,
                      pressed && { backgroundColor: "rgba(255,255,255,0.07)" },
                    ]}
                    accessibilityRole="button"
                  >
                    <ThemedText style={styles.swapOptionText}>{meal.name}</ThemedText>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function MacroDot() {
  return <View style={styles.macroDot} />;
}

function SlotImage({
  slot,
  target,
  image,
}: {
  slot: WizardSlot;
  target: ApiMealDistribution;
  image: string | undefined;
}) {
  const serve = slot === "Mellanmål" ? copy.slotServeAnytime : SLOT_SERVES[slot];
  return (
    <View style={styles.slotImageWrap}>
      {image ? (
        <Image
          source={{ uri: image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityLabel={slot}
          transition={150}
        />
      ) : null}
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(22,22,26,0.55)", SURFACE]}
        locations={[0.3, 0.8, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.slotBadge}>
        <ThemedText style={styles.slotBadgeText}>{slot}</ThemedText>
      </View>
      <View style={styles.serveBadge}>
        <Clock size={10} color="rgba(255,255,255,0.9)" />
        <ThemedText style={styles.serveBadgeText}>{serve}</ThemedText>
      </View>
      <View style={styles.targetRow}>
        <ThemedText style={styles.targetLabel}>{copy.slotTarget.toUpperCase()} </ThemedText>
        <ThemedText style={styles.targetText}>
          {target.calories} kcal <ThemedText style={styles.targetDot}>·</ThemedText> {target.proteinG}g
          protein
        </ThemedText>
      </View>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────── */

const styles = StyleSheet.create({
  // Web heldag BG is #0C0C0E; the shared bgDeep token (#0A0A0A) is reused,
  // consistent with the rest of the app's ports.
  root: { flex: 1, backgroundColor: colors.bgDeep },
  center: { alignItems: "center", justifyContent: "center", gap: spacing[3] },
  loadingText: { fontSize: 13, color: TEXT_DIM },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerLogo: { width: 100, height: 28 },

  /* Hero */
  hero: {
    height: 360,
    marginBottom: -64,
    overflow: "hidden",
    backgroundColor: "#1a1410",
  },
  heroGlow: {
    position: "absolute",
    top: -20,
    right: -30,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(232,101,10,0.20)",
  },
  heroContent: { position: "absolute", left: 20, right: 20, bottom: 80, zIndex: 2 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    marginBottom: 14,
    borderRadius: 999,
    paddingVertical: 5,
    paddingLeft: 9,
    paddingRight: 11,
    backgroundColor: "rgba(232,101,10,0.18)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.45)",
  },
  heroBadgeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  heroBadgeText: {
    fontSize: 10.5,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: "#FFB070",
  },
  heroTitle: {
    fontSize: 36,
    lineHeight: 37,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -1.4,
    color: "#fff",
    maxWidth: 320,
  },

  heroTextWrap: { paddingHorizontal: spacing[5], paddingBottom: 6, zIndex: 3 },
  heroBodyText: {
    fontSize: 15.5,
    lineHeight: 22,
    color: "rgba(255,255,255,0.78)",
    maxWidth: 340,
  },
  heroBodyStrong: { fontSize: 15.5, color: "#fff", fontFamily: fontFamily.bodyMedium },
  heroNote: { marginTop: 6, fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.5)" },

  /* Info note */
  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    marginHorizontal: spacing[4],
    marginTop: 18,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  infoNoteIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.14)",
  },
  infoNoteText: { flex: 1, fontSize: 13, lineHeight: 18, color: TEXT_DIM },
  infoNoteStrong: { fontSize: 13, color: "#fff", fontFamily: fontFamily.bodySemibold },

  /* Section heads */
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: spacing[5],
    paddingTop: 26,
    paddingBottom: 12,
  },
  sectionHead: {
    fontSize: 11,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.42)",
  },
  sectionHeadMeta: { fontSize: 11, fontFamily: fontFamily.mono, color: TEXT_MUTE, letterSpacing: 0.3 },

  /* Summary card */
  summaryCard: {
    marginHorizontal: spacing[4],
    overflow: "hidden",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.32)",
  },
  summaryGlow: {
    position: "absolute",
    top: -60,
    right: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(232,101,10,0.12)",
  },
  summaryHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  summaryHeadLabel: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.accent,
  },
  readyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingVertical: 3,
    paddingLeft: 6,
    paddingRight: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  readyBadgeCheck: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  readyBadgeText: {
    fontSize: 10.5,
    fontFamily: fontFamily.bodySemibold,
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.3,
  },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
  summaryCell: { width: "50%", paddingLeft: 12, borderLeftWidth: 1, gap: 3 },
  summaryCellLabel: {
    fontSize: 10.5,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: TEXT_MUTE,
  },
  summaryCellValue: {
    fontSize: 22,
    fontFamily: fontFamily.monoMedium,
    color: "#fff",
    letterSpacing: -0.6,
    lineHeight: 24,
  },
  summaryCellUnit: { fontSize: 12, fontFamily: fontFamily.mono, color: TEXT_MUTE, letterSpacing: 0.2 },

  /* Slot cards */
  slotCard: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  slotMissingText: { fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.45)" },
  slotErrorText: { fontSize: 12, color: "#FF7A7A" },
  slotBody: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  slotTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  slotMealName: {
    flex: 1,
    fontSize: 18,
    fontFamily: fontFamily.bodyBold,
    color: "#fff",
    letterSpacing: -0.4,
    lineHeight: 22,
  },
  slotPrice: { fontSize: 17, fontFamily: fontFamily.monoMedium, color: "#fff", letterSpacing: -0.3 },
  slotPriceUnit: { fontSize: 11, fontFamily: fontFamily.mono, color: TEXT_MUTE },
  slotMacroRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  slotMacroProtein: { fontSize: 13, fontFamily: fontFamily.monoMedium, color: colors.accent },
  slotMacroText: { fontSize: 12.5, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.72)" },
  macroDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  slotChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  slotChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  slotChipText: { fontSize: 11.5, color: "rgba(255,255,255,0.72)" },
  slotChipGrams: { fontSize: 11, fontFamily: fontFamily.monoMedium, color: "#fff" },
  slotFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
  },
  includedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  includedCheck: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.18)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.42)",
  },
  includedText: {
    fontSize: 11,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.accent,
  },
  swapToggle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    textDecorationLine: "underline",
  },
  swapPanel: { borderTopWidth: 1, borderTopColor: HAIRLINE, paddingTop: 12, marginTop: 2 },
  swapPanelHead: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: TEXT_MUTE,
    marginBottom: 8,
  },
  swapEmpty: { fontSize: 12, color: TEXT_MUTE },
  swapOption: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  swapOptionText: { fontSize: 13, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.82)" },

  /* Slot image */
  slotImageWrap: { height: 152, backgroundColor: "#1a1410" },
  slotBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 2,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: "rgba(232,101,10,0.95)",
  },
  slotBadgeText: {
    fontSize: 10.5,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#fff",
  },
  serveBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingVertical: 5,
    paddingLeft: 8,
    paddingRight: 9,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  serveBadgeText: {
    fontSize: 10.5,
    fontFamily: fontFamily.monoMedium,
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 0.3,
  },
  targetRow: {
    position: "absolute",
    bottom: 12,
    left: 14,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "baseline",
  },
  targetLabel: {
    fontSize: 9.5,
    fontFamily: fontFamily.mono,
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.5)",
  },
  targetText: { fontSize: 11, fontFamily: fontFamily.monoMedium, color: "rgba(255,255,255,0.78)" },
  targetDot: { color: "rgba(255,255,255,0.3)" },

  /* Sticky CTA */
  ctaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  cta: {
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  ctaAvailable: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  ctaClosed: {
    backgroundColor: "#1F1F24",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  ctaLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  ctaText: { fontSize: 15, fontFamily: fontFamily.bodySemibold, color: "#fff", letterSpacing: 0.1 },
  ctaTextClosed: { color: "rgba(255,255,255,0.62)" },
  ctaPrice: {
    fontSize: 14,
    fontFamily: fontFamily.monoMedium,
    color: "rgba(255,255,255,0.92)",
    letterSpacing: 0.2,
  },
  ctaNotReady: { marginTop: 8, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.4)" },

  /* Error states */
  errorEmoji: { fontSize: 30 },
  errorTitle: {
    fontSize: 19,
    fontFamily: fontFamily.bodyBold,
    color: "#fff",
    textAlign: "center",
    marginTop: spacing[2],
  },
  errorBody: {
    fontSize: 13.5,
    lineHeight: 20,
    color: TEXT_DIM,
    textAlign: "center",
    maxWidth: 320,
  },
  errorCta: {
    marginTop: spacing[4],
    borderRadius: 16,
    paddingHorizontal: spacing[6],
    paddingVertical: 13,
    backgroundColor: colors.accent,
  },
  errorCtaText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: "#fff" },
});
