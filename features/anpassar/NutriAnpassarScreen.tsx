import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { useAuth } from "@/services/auth/AuthProvider";
import { useOnboardingStatus } from "@/services/auth/useOnboardingStatus";
import { useCart } from "@/context/CartContext";
import { getMeals, type ApiMeal } from "@/services/api/meals";
import { getIngredients, type ApiIngredient } from "@/services/api/ingredients";
import { getContainerTypes, type ApiContainerType } from "@/services/api/containerTypes";
import { getStoreStatus } from "@/services/api/store";
import {
  getTodayNutrition,
  getRemainingToday,
  type ApiMealDistribution,
  type ApiRemainingToday,
  type ApiTodayNutrition,
} from "@/services/api/nutrition";
import { getTodayDayPlan, type SavedDayPlanResponse } from "@/services/api/dayPlan";
import type { CustomMealCalculateResponse } from "@/services/api/customMeal";
import type { ApiError } from "@/types/api";
import { apiMealToMeal } from "@/utils/pricing";
import { env } from "@/lib/env";
import { nutriAnpassarCopy as copy, onboardingGateCopy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";
import { buildNutriAdaptiveTarget } from "./buildNutriAdaptiveTarget";
import type { NutriGoalType } from "./nutriAnpassarTypes";
import { StepSlot, type WizardSlot } from "./StepSlot";
import { StepMeals, type OptIngredient } from "./StepMeals";
import { StepAdjust } from "./StepAdjust";

/**
 * Nutri Anpassar — port of the web (customer)/nutri-anpassar/page.tsx.
 *
 * Flow: gate (login → onboarding-complete) → parallel load of six sources
 * (today's targets, remaining-today, meals, ingredient library, container
 * types, saved day plan) → 3-step wizard (slot → optimized meal picks →
 * optional ingredient adjustment) → shared-cart add → varukorg.
 *
 * Source-of-truth rules ported 1:1:
 * - a saved "Sätt upp din dag" plan overrides the engine's baseline meals
 * - the slot target comes from buildNutriAdaptiveTarget (safe/coach mode,
 *   caps, low-target rescue)
 * - today.meals.length === 0 → the profile-incomplete error state
 * - 4xx on the initial load → profile error; anything else → network error
 * - Anpassar always tailors at medium (1.0×); the cart surcharge reconciles
 *   the cart's basePrice+surcharge formula to the server-calculated
 *   totalPriceOre; meal.name passes as originalMealName so the kitchen/
 *   receipt shows the real meal name instead of "Custom 700ml: …".
 *
 * Adaptations: the onboarding wizard and the profile page are WEB flows the
 * app hasn't ported yet — the gate's primary CTA and the profile-error CTA
 * open them in the browser (same pattern as password reset). Logged-out
 * users go to /logga-in with a return path (the web reaches this page only
 * behind its auth'd customer layout).
 */

type ErrorKind = "profile" | "network";

function mapGoalType(primaryGoal: string): NutriGoalType {
  if (primaryGoal === "FatLoss") return "fat_loss";
  if (primaryGoal === "MuscleGain") return "muscle_gain";
  return "balanced";
}

interface AnpassarData {
  today: ApiTodayNutrition;
  remaining: ApiRemainingToday;
  savedPlan: SavedDayPlanResponse | null;
  meals: ApiMeal[];
  ingredients: ApiIngredient[];
  containers: ApiContainerType[];
}

export function NutriAnpassarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const { loading: profileLoading, isOnboardingComplete } = useOnboardingStatus();
  const { addItem } = useCart();

  const needsGate = !authLoading && !profileLoading && !!user && isOnboardingComplete !== true;
  const checking = authLoading || profileLoading || needsGate;

  // Logged out → login with return path (web reaches this page auth'd).
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace({ pathname: "/logga-in", params: { next: "/nutri-anpassar" } });
    }
  }, [authLoading, user, router]);

  // ── Data state (web's single load() effect, incl. its error mapping) ──
  const [data, setData] = useState<AnpassarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);

  const load = useCallback(async () => {
    try {
      const [today, remaining, meals, ingredients, containers, savedPlan] = await Promise.all([
        getTodayNutrition(),
        getRemainingToday(),
        getMeals(),
        getIngredients(),
        getContainerTypes(),
        getTodayDayPlan().catch(() => null),
      ]);
      if (today.meals.length === 0) {
        setErrorKind("profile");
      } else {
        setData({ today, remaining, meals, ingredients, containers, savedPlan });
      }
    } catch (err) {
      // Web: /API 4\d\d/ on the message → profile, else network. The axios
      // interceptor gives us the status directly — same classification.
      const status = (err as ApiError | undefined)?.status;
      setErrorKind(typeof status === "number" && status >= 400 && status < 500 ? "profile" : "network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checking || !user) return;
    load();
  }, [checking, user, load]);

  // Store status — StepSlot's closed banner + the ordering locks (the web
  // reads useStoreStatus in every step component; one query serves all).
  const storeStatusQuery = useQuery({
    queryKey: ["store", "status"],
    queryFn: getStoreStatus,
    refetchInterval: 30_000,
  });
  const isClosed =
    storeStatusQuery.data?.status === "Closed" ||
    (!storeStatusQuery.isLoading && !storeStatusQuery.data);

  // ── Wizard state ──
  const [step, setStep] = useState<1 | 2 | 2.5>(1);
  const [selectedSlot, setSelectedSlot] = useState<WizardSlot | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<ApiMeal | null>(null);
  const [optimizedIngredients, setOptimizedIngredients] = useState<OptIngredient[]>([]);
  const [selectedContainerTypeId, setSelectedContainerTypeId] = useState<string>("");

  // Effective meals: savedDayPlan wins over auto-calculated today (web parity).
  const effectiveMeals: ApiMealDistribution[] = data
    ? data.savedPlan?.meals?.length
      ? data.savedPlan.meals.map((m) => ({
          ...m,
          timingPurpose: data.today.meals.find((t) => t.label === m.label)?.timingPurpose ?? "",
        }))
      : data.today.meals
    : [];

  const slotTarget: ApiMealDistribution | null =
    selectedSlot && data
      ? buildNutriAdaptiveTarget({
          selectedSlot,
          nowHour: new Date().getHours(),
          goalType: mapGoalType(data.today.primaryGoal),
          todayMeals: effectiveMeals,
          remaining: data.remaining.remainingToday,
          consumedToday: data.remaining.consumedToday,
          dailyCalories: data.today.adjustedTarget.calories,
        })
      : null;

  // ── Cart integration (web's addCustomizedMealToCart, verbatim) ──
  function addCustomizedMealToCart(
    apiMeal: ApiMeal,
    ingredients: OptIngredient[],
    containerTypeId: string,
    calcResult: CustomMealCalculateResponse
  ) {
    const meal = apiMealToMeal(apiMeal);
    const sizeId = "medium"; // Anpassar always tailors at the medium (1.0×) size
    const customMacros = {
      calories: Math.round(calcResult.totalKcal),
      proteinG: Math.round(calcResult.totalProteinG),
      carbsG: Math.round(calcResult.totalCarbsG),
      fatG: Math.round(calcResult.totalFatG),
      fiberG: Math.round(calcResult.totalFiberG),
    };
    const customIngredients = ingredients.map((i) => ({
      ingredientId: i.ingredientId,
      name: i.name,
      amountG: i.amountG,
    }));
    // Cart price formula is basePrice * multiplier + surcharge.
    // medium multiplier = 1.0, so surcharge reconciles to calcResult.totalPriceOre.
    const ingredientSurchargeKr = Math.round(calcResult.totalPriceOre / 100) - meal.basePrice;

    addItem(
      meal,
      sizeId,
      1,
      customMacros,
      customIngredients,
      ingredientSurchargeKr,
      containerTypeId,
      undefined,
      meal.name
    );
    router.push("/(tabs)/varukorg");
  }

  function handleBack() {
    if (step === 2.5) setStep(2);
    else if (step === 2) setStep(1);
    else if (router.canGoBack()) router.back();
    else router.navigate("/(tabs)");
  }

  // ── Guards ──
  if (authLoading || (!user && !authLoading)) {
    return <View style={styles.root} />;
  }
  if (needsGate) {
    return (
      <OnboardingGate
        onPrimary={() => Linking.openURL(`${env.EXPO_PUBLIC_WEB_URL}/onboarding`)}
        onSecondary={() => router.navigate("/(tabs)/meny")}
      />
    );
  }
  if (profileLoading || loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <LoadingIndicator />
      </View>
    );
  }

  // ── Error states ──
  if (errorKind === "profile") {
    return (
      <ErrorScreen
        emoji="🥗"
        title={copy.errorProfileTitle}
        body={copy.errorProfileBody}
        ctaLabel={copy.errorProfileCta}
        onCta={() => Linking.openURL(`${env.EXPO_PUBLIC_WEB_URL}/profil`)}
        onBack={handleBack}
      />
    );
  }
  if (errorKind === "network") {
    return (
      <ErrorScreen
        emoji="⚡"
        title={copy.errorNetworkTitle}
        body={copy.errorNetworkBody}
        ctaLabel={copy.errorRetry}
        onCta={() => {
          setErrorKind(null);
          setLoading(true);
          load();
        }}
        onBack={handleBack}
      />
    );
  }
  if (!data) {
    return (
      <View style={[styles.root, styles.center]}>
        <LoadingIndicator />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Header onBack={handleBack} insetsTop={insets.top} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing[8] }}>
        {step === 1 && (
          <StepSlot
            meals={effectiveMeals}
            remainingToday={data.remaining.remainingToday}
            isClosed={isClosed}
            onSelect={(slot) => {
              setSelectedSlot(slot);
              setStep(2);
            }}
          />
        )}

        {step === 2 && selectedSlot && slotTarget && (
          <StepMeals
            slot={selectedSlot}
            slotTarget={slotTarget}
            remainingTotal={data.remaining.remainingToday}
            allMeals={data.meals}
            ingredientLibrary={data.ingredients}
            containerTypes={data.containers}
            isClosed={isClosed}
            onSelect={(meal, ingredients, containerTypeId, calcResult) =>
              addCustomizedMealToCart(meal, ingredients, containerTypeId, calcResult)
            }
            onAdjust={(meal, ingredients, containerTypeId) => {
              setSelectedMeal(meal);
              setOptimizedIngredients(ingredients);
              setSelectedContainerTypeId(containerTypeId);
              setStep(2.5);
            }}
            onBack={() => setStep(1)}
          />
        )}

        {step === 2.5 && selectedMeal && slotTarget && (
          <StepAdjust
            meal={selectedMeal}
            initialIngredients={optimizedIngredients}
            initialContainerTypeId={selectedContainerTypeId}
            ingredientLibrary={data.ingredients}
            containerTypes={data.containers}
            slotTargetProtein={slotTarget.proteinG}
            slotTargetCalories={slotTarget.calories}
            isClosed={isClosed}
            onConfirm={(ingredients, containerTypeId, calcResult) => {
              if (!selectedMeal) return;
              addCustomizedMealToCart(selectedMeal, ingredients, containerTypeId, calcResult);
            }}
            onBack={() => setStep(2)}
          />
        )}
      </ScrollView>
    </View>
  );
}

/* ── Header (web: AppPageHeader — back + wordmark) ─────────── */

function Header({ onBack, insetsTop }: { onBack: () => void; insetsTop: number }) {
  return (
    <View style={[styles.header, { paddingTop: insetsTop }]}>
      <Pressable
        onPress={onBack}
        style={styles.headerButton}
        accessibilityRole="button"
        accessibilityLabel="Tillbaka"
      >
        <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
      </Pressable>
      <ThemedText style={styles.wordmark}>NUTRI</ThemedText>
      <View style={{ width: 36 }} />
    </View>
  );
}

/* ── Onboarding gate (web: OnboardingGateModal, bottom sheet) ── */

function OnboardingGate({
  onPrimary,
  onSecondary,
}: {
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <View style={styles.gateBackdrop}>
      <View style={styles.gateSheet}>
        <View style={styles.gateAccent} />
        <View style={styles.gateIcon}>
          <Clock size={20} color={colors.accent} strokeWidth={1.8} />
        </View>
        <ThemedText style={styles.gateTitle}>{onboardingGateCopy.title}</ThemedText>
        <ThemedText style={styles.gateBody}>{onboardingGateCopy.body}</ThemedText>
        <Pressable
          onPress={onPrimary}
          style={({ pressed }) => [styles.gatePrimary, pressed && { backgroundColor: colors.accentHover }]}
          accessibilityRole="button"
        >
          <ThemedText style={styles.gatePrimaryText}>{onboardingGateCopy.primary}</ThemedText>
        </Pressable>
        <Pressable
          onPress={onSecondary}
          style={({ pressed }) => [styles.gateSecondary, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
          accessibilityRole="button"
        >
          <ThemedText style={styles.gateSecondaryText}>{onboardingGateCopy.secondary}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

/* ── Error screen (web's profile/network error pages) ────────── */

function ErrorScreen({
  emoji,
  title,
  body,
  ctaLabel,
  onCta,
  onBack,
}: {
  emoji: string;
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <Header onBack={onBack} insetsTop={insets.top} />
      <View style={styles.errorWrap}>
        <ThemedText style={styles.errorEmoji}>{emoji}</ThemedText>
        <ThemedText style={styles.errorTitle}>{title}</ThemedText>
        <ThemedText style={styles.errorBody}>{body}</ThemedText>
        <Pressable
          onPress={onCta}
          style={({ pressed }) => [styles.errorCta, pressed && { backgroundColor: colors.accentHover }]}
          accessibilityRole="button"
        >
          <ThemedText style={styles.errorCtaText}>{ctaLabel}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Web's Anpassar page uses a deeper #0A0A0A background than the rest.
  root: { flex: 1, backgroundColor: colors.bgDeep },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[2],
    backgroundColor: "rgba(10,10,10,0.92)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 3,
    color: colors.textPrimary,
  },
  /* Gate */
  gateBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  gateSheet: {
    backgroundColor: "#0A0A0D",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 48,
    gap: spacing[4],
    overflow: "hidden",
  },
  gateAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: colors.accent },
  gateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(232,101,10,0.12)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  gateTitle: {
    fontSize: 22,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.5,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  gateBody: { marginTop: -spacing[2], fontSize: 14.5, lineHeight: 22, color: "rgba(255,255,255,0.62)" },
  gatePrimary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  gatePrimaryText: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  gateSecondary: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  gateSecondaryText: { fontSize: 15, fontFamily: fontFamily.bodySemibold, color: "rgba(255,255,255,0.55)" },
  /* Error */
  errorWrap: { paddingHorizontal: spacing[6], paddingTop: spacing[10], alignItems: "center" },
  errorEmoji: { fontSize: 32, marginBottom: spacing[4] },
  errorTitle: {
    textAlign: "center",
    fontSize: 20,
    fontFamily: fontFamily.bodyBold,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  errorBody: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 22,
    color: "#888888",
    marginBottom: 28,
    maxWidth: 340,
  },
  errorCta: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  errorCtaText: { fontSize: 14, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
});
