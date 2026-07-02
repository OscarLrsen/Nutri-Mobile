import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Slider from "@react-native-community/slider";
import { ArrowLeft, Check, Minus, Plus, RotateCcw, Sparkles } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import {
  deleteMacroOverride,
  getNutritionProfile,
  getNutritionResult,
  previewNutritionResult,
  upsertMacroOverride,
  type ApiNutritionResult,
  type MacroOverrideDto,
} from "@/services/api/nutrition";
import { macroAdjustCopy as copy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";
import { mapBodyFat } from "./profileOptions";

/**
 * Justera makros — port of the web's app/profil/justera-makros/page.tsx.
 * Logic preserved verbatim: kcal stepper (±50, clamp 1500–5000) + typed
 * draft committed on blur, macro sliders/steppers (±5g; protein max 350,
 * carbs 600, fat 200), balance rule (macro kcal within 95–105% of target
 * AND |diff| ≤ 50 to save), the recalc CTA that resizes macros for a new
 * kcal target (protein per-kg by goal with lean-mass/BMI-25 base and
 * planFocus adjustments — mirrors NutritionEngineService), override
 * save/reset through PUT/DELETE /nutrition-profile/override, and the
 * Nutri-recommendation line (result when Auto, preview of the stored
 * profile when overridden).
 */

const MACRO_COLORS = { protein: colors.accent, carbs: "#5FA0FF", fat: "#F0C14B" } as const;
const MACRO_KCAL_FACTOR = { protein: 4, carbs: 4, fat: 9 } as const;
const STEP = { kcal: 50, macro: 5 } as const;

export function MacroAdjustScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [result, setResult] = useState<ApiNutritionResult | null>(null);
  const [recommendation, setRecommendation] = useState<ApiNutritionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [weightKg, setWeightKg] = useState(0);
  const [heightCm, setHeightCm] = useState(0);
  const [bodyFatLevel, setBodyFatLevel] = useState<number | null>(null);
  const [gender, setGender] = useState("");
  const [planFocus, setPlanFocus] = useState<string | null>(null);

  const [userKcal, setUserKcal] = useState(0);
  const [kcalDraft, setKcalDraft] = useState("");
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);

  const [initialKcal, setInitialKcal] = useState(0);
  const [initialProtein, setInitialProtein] = useState(0);
  const [initialCarbs, setInitialCarbs] = useState(0);
  const [initialFat, setInitialFat] = useState(0);

  // The kcal value the current macros were last sized for — diverging from
  // it surfaces the recalc CTA (web parity).
  const [recalcTarget, setRecalcTarget] = useState(0);

  const applyResult = (r: ApiNutritionResult) => {
    const k = r.userCalorieTarget ?? r.calorieTarget;
    setProtein(r.proteinG);
    setInitialProtein(r.proteinG);
    setCarbs(r.carbsG);
    setInitialCarbs(r.carbsG);
    setFat(r.fatG);
    setInitialFat(r.fatG);
    setUserKcal(k);
    setInitialKcal(k);
    setRecalcTarget(k);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getNutritionResult();
      setResult(r);
      applyResult(r);

      const np = await getNutritionProfile();
      if (np) {
        setWeightKg(np.weightKg);
        setHeightCm(np.heightCm);
        setBodyFatLevel(np.bodyFatLevel);
        setGender(np.gender);
        setPlanFocus(np.planFocus ?? null);
      }

      if (r.mode === "Auto") {
        setRecommendation(r);
      } else if (np) {
        try {
          setRecommendation(
            await previewNutritionResult({
              gender: np.gender,
              ageYears: np.ageYears,
              weightKg: np.weightKg,
              heightCm: np.heightCm,
              bodyFatLevel: np.bodyFatLevel,
              targetWeightKg: np.targetWeightKg,
              activityType: np.activityType,
              stepsRange: np.stepsRange,
              trainingSessions: np.trainingSessions,
              primaryGoal: np.primaryGoal,
              goalPace: np.goalPace,
              mealCountMain: np.mealCountMain,
              mealCountSnacks: np.mealCountSnacks,
              planFocus: np.planFocus ?? null,
            })
          );
        } catch {
          // best-effort (web parity)
        }
      }
    } catch {
      // Web redirects to /profil on failure — mobile pops back.
      if (router.canGoBack()) router.back();
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep the typed draft in sync with the canonical kcal value (web parity).
  useEffect(() => {
    setKcalDraft(String(userKcal));
  }, [userKcal]);

  // ── Derived (verbatim web) ──
  const macroPlanKcal = protein * 4 + carbs * 4 + fat * 9;
  const recKcal = recommendation
    ? recommendation.proteinG * 4 + recommendation.carbsG * 4 + recommendation.fatG * 9
    : null;
  const totalPct = userKcal > 0 ? Math.round((macroPlanKcal / userKcal) * 100) : 0;
  const inBalance = totalPct >= 95 && totalPct <= 105;
  const diff = macroPlanKcal - userKcal;
  const isDirty =
    protein !== initialProtein || carbs !== initialCarbs || fat !== initialFat || userKcal !== initialKcal;
  const canSave = isDirty && Math.abs(diff) <= 50;
  const isCustomMode = result?.mode === "CustomMacros";
  const needsRecalc = userKcal !== recalcTarget && weightKg > 0;

  // ── Handlers (verbatim web) ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const dto: MacroOverrideDto = {
        proteinG: protein,
        carbsG: carbs,
        fatG: fat,
        fiberG: result?.fiberG ?? 0,
        userCalorieTarget: userKcal,
      };
      await upsertMacroOverride(dto);
      const updated = await getNutritionResult();
      setResult(updated);
      applyResult(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch {
      // stay on page (web parity)
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await deleteMacroOverride();
      const updated = await getNutritionResult();
      setResult(updated);
      applyResult(updated);
    } catch {
      // stay on page (web parity)
    } finally {
      setResetting(false);
    }
  };

  /** Resize macros for the new kcal target — mirrors
   * NutritionEngineService.CalculateMacros (verbatim web port). */
  const recalcMacros = () => {
    if (!weightKg || !result) return;
    const goal = result.primaryGoal;
    const proteinPerKg = goal === "FatLoss" ? 2.2 : goal === "MuscleGain" ? 2.0 : 1.8;

    let proteinBaseWeight = weightKg;
    const bfPct = mapBodyFat(bodyFatLevel, gender);
    if (bfPct !== null) {
      proteinBaseWeight = weightKg * (1 - bfPct);
    } else if (heightCm > 0) {
      const heightM = heightCm / 100;
      const bmi = weightKg / (heightM * heightM);
      if (bmi >= 27) {
        proteinBaseWeight = Math.min(weightKg, heightM * heightM * 25);
      }
    }

    let proteinG = proteinBaseWeight * proteinPerKg;
    let fatG = Math.max(0.6 * weightKg, 40);

    if (planFocus === "Satiety") {
      fatG *= 1.1;
    } else if (planFocus === "Performance") {
      fatG = Math.max(fatG * 0.9, Math.max(0.5 * weightKg, 35));
    } else if (planFocus === "Health") {
      proteinG = Math.max(proteinG * 0.95, 1.6 * proteinBaseWeight);
      fatG *= 1.1;
    }

    const newProtein = Math.round(proteinG);
    const newFat = Math.round(fatG);
    const carbKcal = userKcal - newProtein * 4 - newFat * 9;
    setProtein(newProtein);
    setFat(newFat);
    setCarbs(Math.round(Math.max(carbKcal / 4, 0)));
    setRecalcTarget(userKcal);
  };

  const handleStepKcal = (delta: number) => {
    setUserKcal((prev) => Math.min(5000, Math.max(1500, prev + delta)));
  };

  const commitKcalDraft = () => {
    const parsed = parseInt(kcalDraft.replace(/\D/g, ""), 10);
    if (!Number.isFinite(parsed)) {
      setKcalDraft(String(userKcal));
      return;
    }
    const clamped = Math.min(5000, Math.max(1500, parsed));
    setUserKcal(clamped);
    setKcalDraft(String(clamped));
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <LoadingIndicator />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)/konto"))}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Tillbaka"
        >
          <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{copy.title}</ThemedText>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing[8] }}>
        {/* Status card */}
        <View style={[styles.card, styles.statusCard]}>
          <View
            style={[
              styles.statusIcon,
              {
                backgroundColor: inBalance ? "rgba(109,212,159,0.10)" : "rgba(232,101,10,0.10)",
                borderColor: inBalance ? "rgba(109,212,159,0.25)" : "rgba(232,101,10,0.30)",
              },
            ]}
          >
            {inBalance ? (
              <Check size={14} color="#6DD49F" strokeWidth={1.7} />
            ) : (
              <ThemedText style={{ fontSize: 12, fontFamily: fontFamily.bodyBold, color: colors.accent }}>
                !
              </ThemedText>
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText style={styles.statusTitle}>
              {inBalance ? copy.statusMatch : copy.statusNeeds}
            </ThemedText>
            <ThemedText style={styles.statusSub}>
              {userKcal.toLocaleString("sv-SE")} kcal ·{" "}
              <ThemedText style={[styles.statusSub, { color: inBalance ? "#6DD49F" : colors.accent }]}>
                {totalPct}%
              </ThemedText>
            </ThemedText>
          </View>
        </View>

        {/* Kalorimål */}
        <ThemedText style={styles.sectionHead}>{copy.calorieGoal.toUpperCase()}</ThemedText>
        <View style={[styles.card, { paddingHorizontal: spacing[4], paddingVertical: spacing[4] }]}>
          <View style={styles.kcalRow}>
            <StepperButton
              onPress={() => handleStepKcal(-STEP.kcal)}
              disabled={userKcal <= 1500}
              label={copy.decreaseCalories}
            >
              <Minus size={14} color="rgba(255,255,255,0.85)" strokeWidth={1.6} />
            </StepperButton>
            <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
              <TextInput
                value={kcalDraft}
                onChangeText={(v) => setKcalDraft(v.replace(/[^\d]/g, ""))}
                onBlur={commitKcalDraft}
                onSubmitEditing={commitKcalDraft}
                selectTextOnFocus
                keyboardType="number-pad"
                maxLength={4}
                accessibilityLabel={copy.calorieGoal}
                style={styles.kcalInput}
              />
              <ThemedText style={styles.kcalUnit}>kcal</ThemedText>
            </View>
            <StepperButton
              onPress={() => handleStepKcal(STEP.kcal)}
              disabled={userKcal >= 5000}
              label={copy.increaseCalories}
            >
              <Plus size={14} color="rgba(255,255,255,0.85)" strokeWidth={1.6} />
            </StepperButton>
          </View>
          {recKcal !== null && (
            <View style={styles.recLine}>
              <ThemedText style={styles.recText}>
                {copy.recommendation}{" "}
                <ThemedText style={styles.recValue}>
                  {recKcal.toLocaleString("sv-SE")} kcal
                </ThemedText>
              </ThemedText>
            </View>
          )}
        </View>

        {/* Recalc CTA */}
        {needsRecalc && (
          <Pressable onPress={recalcMacros} style={styles.recalcButton} accessibilityRole="button">
            <View style={styles.recalcIcon}>
              <Sparkles size={12} color="#8FB9FF" />
            </View>
            <ThemedText style={styles.recalcText}>
              {copy.recalcFor}{" "}
              <ThemedText style={[styles.recalcText, { color: "#B3D0FF", fontFamily: fontFamily.monoMedium }]}>
                {userKcal.toLocaleString("sv-SE")}
              </ThemedText>{" "}
              kcal
            </ThemedText>
          </Pressable>
        )}

        {/* Makrofördelning */}
        <ThemedText style={styles.sectionHead}>{copy.macroDistribution.toUpperCase()}</ThemedText>
        <View style={[styles.card, { paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[3], gap: spacing[4] }]}>
          <MacroRow
            name={copy.macroProtein}
            colorKey="protein"
            grams={protein}
            totalKcal={userKcal}
            max={350}
            onChange={setProtein}
            onMinus={() => setProtein((p) => Math.max(0, p - STEP.macro))}
            onPlus={() => setProtein((p) => p + STEP.macro)}
          />
          <MacroRow
            name={copy.macroCarbs}
            colorKey="carbs"
            grams={carbs}
            totalKcal={userKcal}
            max={600}
            onChange={setCarbs}
            onMinus={() => setCarbs((c) => Math.max(0, c - STEP.macro))}
            onPlus={() => setCarbs((c) => c + STEP.macro)}
          />
          <MacroRow
            name={copy.macroFat}
            colorKey="fat"
            grams={fat}
            totalKcal={userKcal}
            max={200}
            onChange={setFat}
            onMinus={() => setFat((f) => Math.max(0, f - STEP.macro))}
            onPlus={() => setFat((f) => f + STEP.macro)}
          />
          <View style={styles.sumRow}>
            <ThemedText style={styles.sumLabel}>{copy.macroSum}</ThemedText>
            <ThemedText style={[styles.sumValue, { color: inBalance ? "#6DD49F" : colors.accent }]}>
              {macroPlanKcal.toLocaleString("sv-SE")} kcal
              {diff !== 0 ? (
                <ThemedText style={styles.sumDiff}>
                  {" "}
                  ({diff > 0 ? "+" : ""}
                  {diff})
                </ThemedText>
              ) : null}
            </ThemedText>
          </View>
        </View>

        {/* Bottom actions */}
        <View style={{ marginHorizontal: spacing[4], marginTop: spacing[4], gap: spacing[2] }}>
          <Pressable
            onPress={handleReset}
            disabled={!isCustomMode || resetting}
            style={[styles.resetButton, (!isCustomMode || resetting) && { opacity: 0.35 }]}
            accessibilityRole="button"
          >
            <RotateCcw size={13} color="rgba(255,255,255,0.55)" strokeWidth={1.5} />
            <ThemedText style={styles.resetText}>
              {resetting ? copy.resetting : copy.reset}
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={!canSave || saving || saveSuccess}
            style={[
              styles.saveButton,
              saveSuccess
                ? { backgroundColor: "#166534" }
                : canSave && !saving
                  ? { backgroundColor: colors.accent }
                  : styles.saveButtonDisabled,
            ]}
            accessibilityRole="button"
          >
            <ThemedText
              style={[
                styles.saveText,
                !canSave && !saving && !saveSuccess && { color: "rgba(255,255,255,0.32)" },
              ]}
            >
              {saving
                ? copy.saving
                : saveSuccess
                  ? copy.saved
                  : canSave
                    ? copy.saveChanges
                    : isDirty
                      ? copy.adjustMacros(`${diff > 0 ? "+" : ""}${diff}`)
                      : copy.noChanges}
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function StepperButton({
  onPress,
  disabled,
  label,
  children,
  small,
}: {
  onPress: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
  small?: boolean;
}) {
  const dim = small ? 30 : 38;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.stepperButton, { width: dim, height: dim, borderRadius: dim / 2 }, disabled && { opacity: 0.3 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  );
}

function MacroRow({
  name,
  colorKey,
  grams,
  totalKcal,
  max,
  onChange,
  onMinus,
  onPlus,
}: {
  name: string;
  colorKey: keyof typeof MACRO_COLORS;
  grams: number;
  totalKcal: number;
  max: number;
  onChange: (v: number) => void;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const color = MACRO_COLORS[colorKey];
  const macroKcal = grams * MACRO_KCAL_FACTOR[colorKey];
  const pct = totalKcal > 0 ? Math.round((macroKcal / totalKcal) * 100) : 0;

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.macroHeadRow}>
        <View style={[styles.macroDot, { backgroundColor: color }]} />
        <ThemedText style={styles.macroName}>{name}</ThemedText>
        <ThemedText style={[styles.macroGrams, { color }]}>{grams} g</ThemedText>
        <ThemedText style={styles.macroPct}>{pct}%</ThemedText>
      </View>
      <View style={styles.macroSliderRow}>
        <StepperButton onPress={onMinus} disabled={grams <= 0} label={copy.decreaseNamed(name)} small>
          <Minus size={12} color="rgba(255,255,255,0.85)" strokeWidth={1.6} />
        </StepperButton>
        <Slider
          style={{ flex: 1, height: 40 }}
          minimumValue={0}
          maximumValue={max}
          step={1}
          value={grams}
          onValueChange={(v) => onChange(Math.round(v))}
          minimumTrackTintColor={color}
          maximumTrackTintColor="rgba(255,255,255,0.06)"
          thumbTintColor={color}
        />
        <StepperButton onPress={onPlus} label={copy.increaseNamed(name)} small>
          <Plus size={12} color="rgba(255,255,255,0.85)" strokeWidth={1.6} />
        </StepperButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    backgroundColor: colors.headerBg,
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
  headerTitle: { flex: 1, fontSize: 16, fontFamily: fontFamily.bodyBold, letterSpacing: -0.3, color: colors.textPrimary },
  card: {
    marginHorizontal: spacing[4],
    backgroundColor: "#17171A",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  statusCard: {
    marginTop: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  statusIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitle: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, letterSpacing: -0.2, color: colors.textPrimary },
  statusSub: { fontSize: 11.5, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.45)" },
  sectionHead: {
    marginHorizontal: spacing[5],
    marginTop: spacing[4],
    marginBottom: spacing[2],
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    color: colors.textMuted,
  },
  kcalRow: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  kcalInput: {
    width: "100%",
    textAlign: "center",
    fontSize: 44,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -1.4,
    color: colors.textPrimary,
    padding: 0,
  },
  kcalUnit: { fontSize: 11, letterSpacing: 0.4, color: "rgba(255,255,255,0.42)" },
  recLine: {
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    alignItems: "center",
  },
  recText: { fontSize: 11.5, color: "rgba(255,255,255,0.4)" },
  recValue: { fontSize: 11.5, fontFamily: fontFamily.monoMedium, color: "rgba(255,255,255,0.7)" },
  recalcButton: {
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(95,160,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(95,160,255,0.35)",
    borderRadius: 13,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  recalcIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(95,160,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  recalcText: { flex: 1, fontSize: 13, fontFamily: fontFamily.bodySemibold, lineHeight: 17, color: "#8FB9FF" },
  macroHeadRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroName: { flex: 1, fontSize: 14, fontFamily: fontFamily.bodySemibold, letterSpacing: -0.2, color: colors.textPrimary },
  macroGrams: { fontSize: 14, fontFamily: fontFamily.monoMedium, letterSpacing: -0.2 },
  macroPct: { minWidth: 38, textAlign: "right", fontSize: 12, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.45)" },
  macroSliderRow: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  stepperButton: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  sumRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  sumLabel: { fontSize: 11.5, color: "rgba(255,255,255,0.35)" },
  sumValue: { fontSize: 12, fontFamily: fontFamily.monoMedium },
  sumDiff: { fontSize: 11, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.4)" },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 13,
    paddingVertical: spacing[3],
  },
  resetText: { fontSize: 13.5, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.7)" },
  saveButton: {
    borderRadius: 14,
    paddingVertical: spacing[4],
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  saveText: { fontSize: 15, fontFamily: fontFamily.bodyBold, letterSpacing: -0.2, color: colors.textPrimary },
});
