import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { useAuth } from "@/services/auth/AuthProvider";
import { useOnboardingStatus } from "@/services/auth/useOnboardingStatus";
import { supabase } from "@/services/auth/supabase";
import {
  getNutritionProfile,
  getNutritionResult,
  previewNutritionResult,
  upsertNutritionProfile,
  type ApiNutritionProfile,
  type ApiNutritionResult,
  type UpsertNutritionProfileDto,
} from "@/services/api/nutrition";
import {
  getWeeklySchedule,
  upsertWeeklySchedule,
  type WeeklyScheduleDto,
} from "@/services/api/weeklySchedule";
import { ACTIVE_ORDER_KEY } from "@/utils/activeOrder";
import { authCopy, couponCopy, pointsCopy, profileCopy as copy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";
import {
  deriveTrainingSessionsFromWeeklySchedule,
} from "./profileOptions";
import { EditSectionModal, type EditSection, type ProfileFormState } from "./EditSectionModal";
import { TrainingScheduleSheet } from "./TrainingScheduleSheet";
import { OrderHistory } from "./OrderHistory";

/**
 * Profile — port of the web's app/profil/page.tsx with the approved V1
 * scope: identity row, DIN AKTIVA PLAN (incl. manual-override badge,
 * recommendation line, >20% deviation warning, "Ändra plan" →
 * justera-makros), NÄSTA STEG (menu + inline order history), MITT KONTO
 * (grunddata/aktivitet/mål edit modals + training-schedule sheet),
 * onboarding modal/banner and logout.
 *
 * Approved deviations from the web (documented per V1 decision):
 * - No account deletion.
 * - No "Planera din dag" button (/dag is not ported; opening it in a
 *   browser would hit an unauthenticated web session).
 * - The onboarding modal's "Kom igång" and the resumption banner's
 *   "Fortsätt" open the IN-APP grunddata modal — the approved primary path
 *   to a complete profile (the web routes to its /onboarding wizard).
 *   Completing the profile sets profiles.is_onboarding_complete = true,
 *   exactly like the web's save path.
 */

const PLAN_FOCUS_MAP: Record<string, string> = {
  satiety: "Satiety",
  performance: "Performance",
  health: "Health",
  balance: "Balance",
};

function mapPlanFocusBack(planFocus: string | null): string {
  const map: Record<string, string> = {
    Satiety: "satiety",
    Performance: "performance",
    Health: "health",
    Balance: "balance",
  };
  return map[planFocus ?? ""] ?? "balance";
}

const EMPTY_FORM: ProfileFormState = {
  gender: "Male",
  ageYears: "",
  weightKg: "",
  heightCm: "",
  bodyFatLevel: null,
  activityType: "Mixed",
  stepsRange: null,
  trainingSessions: null,
  primaryGoal: "Maintain",
  goalPace: null,
};

function formFromProfile(np: ApiNutritionProfile): ProfileFormState {
  return {
    gender: np.gender as "Male" | "Female",
    ageYears: np.ageYears > 0 ? String(np.ageYears) : "",
    weightKg: np.weightKg > 0 ? String(np.weightKg) : "",
    heightCm: np.heightCm > 0 ? String(np.heightCm) : "",
    bodyFatLevel: np.bodyFatLevel,
    activityType: np.activityType as ProfileFormState["activityType"],
    stepsRange: np.stepsRange,
    trainingSessions: np.trainingSessions,
    primaryGoal: np.primaryGoal as ProfileFormState["primaryGoal"],
    goalPace: np.goalPace,
  };
}

function buildDtoFromStoredProfile(np: ApiNutritionProfile): UpsertNutritionProfileDto {
  return {
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
    isPostmenopausal: np.isPostmenopausal,
    cyclePhase: np.cyclePhase,
    planFocus: np.planFocus ?? null,
  };
}

export function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const { isOnboardingComplete } = useOnboardingStatus();

  // ── Nutrition profile state ──
  const [nutritionProfile, setNutritionProfile] = useState<ApiNutritionProfile | null>(null);
  const [nutritionResult, setNutritionResult] = useState<ApiNutritionResult | null>(null);
  const [nutriRecommendation, setNutriRecommendation] = useState<ApiNutritionResult | null>(null);
  const [nutritionLoading, setNutritionLoading] = useState(true);

  // ── UI state ──
  const [editing, setEditing] = useState<EditSection | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveDone, setSaveDone] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [planFocus, setPlanFocus] = useState<string>("balance");

  // ── Weekly schedule state ──
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklyScheduleDto[] | null>(null);
  const [weeklyScheduleLoading, setWeeklyScheduleLoading] = useState(false);
  const [weeklyScheduleSaving, setWeeklyScheduleSaving] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);

  const buildDto = useCallback(
    (): UpsertNutritionProfileDto => ({
      gender: form.gender,
      ageYears: parseInt(form.ageYears) || 0,
      weightKg: parseFloat(form.weightKg) || 0,
      heightCm: parseInt(form.heightCm) || 0,
      bodyFatLevel: form.bodyFatLevel,
      targetWeightKg: null,
      activityType: form.activityType,
      stepsRange: form.stepsRange,
      trainingSessions: form.trainingSessions,
      primaryGoal: form.primaryGoal,
      goalPace: form.primaryGoal === "Maintain" ? null : form.goalPace,
      mealCountMain: 3,
      mealCountSnacks: 1,
      planFocus: PLAN_FOCUS_MAP[planFocus] ?? "Balance",
    }),
    [form, planFocus]
  );

  // Active targets + (when overridden) Nutri's own recommendation (web parity).
  const reloadResult = useCallback(async (forProfile?: ApiNutritionProfile | null) => {
    try {
      const result = await getNutritionResult();
      setNutritionResult(result);
      if (result.mode === "Auto") {
        setNutriRecommendation(result);
      } else if (forProfile) {
        try {
          setNutriRecommendation(await previewNutritionResult(buildDtoFromStoredProfile(forProfile)));
        } catch {
          setNutriRecommendation(null);
        }
      }
    } catch {
      setNutritionResult(null);
      setNutriRecommendation(null);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setNutritionLoading(true);
      try {
        const np = await getNutritionProfile();
        if (cancelled) return;
        setNutritionProfile(np);
        if (np) {
          setForm(formFromProfile(np));
          setPlanFocus(mapPlanFocusBack(np.planFocus));
          if (np.isComplete) await reloadResult(np);
        }
      } catch {
        if (!cancelled) setNutritionProfile(null);
      } finally {
        if (!cancelled) setNutritionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, reloadResult]);

  // Onboarding modal (web parity: shows when profile onboarding !== true).
  useEffect(() => {
    if (isOnboardingComplete !== true && isOnboardingComplete !== undefined) {
      setShowOnboardingModal(isOnboardingComplete === null);
    }
  }, [isOnboardingComplete]);

  // Weekly schedule loads once the profile exists (web parity).
  const loadWeeklySchedule = useCallback(async () => {
    setWeeklyScheduleLoading(true);
    try {
      setWeeklySchedule(await getWeeklySchedule());
    } catch {
      // non-fatal — sheet shows loading state until retry
    } finally {
      setWeeklyScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && nutritionProfile) loadWeeklySchedule();
  }, [user, nutritionProfile, loadWeeklySchedule]);

  // ── Edit handlers (web parity) ──
  const openEdit = (section: EditSection) => {
    if (nutritionProfile) {
      setForm(formFromProfile(nutritionProfile));
      setPlanFocus(mapPlanFocusBack(nutritionProfile.planFocus));
    }
    setSaveError("");
    setEditing(section);
  };

  const setOnboardingComplete = async (value: boolean) => {
    if (!user) return;
    await supabase.from("profiles").update({ is_onboarding_complete: value }).eq("id", user.id);
    await queryClient.invalidateQueries({ queryKey: ["profiles", user.id] });
  };

  const saveEdit = async () => {
    setSaving(true);
    setSaveError("");
    if (editing === "grunddata") {
      const age = parseInt(form.ageYears);
      const weight = parseFloat(form.weightKg);
      const height = parseInt(form.heightCm);
      if (
        isNaN(age) || age < 10 || age > 120 ||
        isNaN(weight) || weight < 30 || weight > 400 ||
        isNaN(height) || height < 100 || height > 250
      ) {
        setSaveError(copy.errorInvalidBasics);
        setSaving(false);
        return;
      }
    }
    try {
      const updated = await upsertNutritionProfile(buildDto());
      setNutritionProfile(updated);
      setPlanFocus(mapPlanFocusBack(updated.planFocus));
      if (updated.isComplete) {
        await reloadResult(updated);
        if (isOnboardingComplete !== true) {
          await setOnboardingComplete(true).catch(() => {});
        }
      } else {
        setNutritionResult(null);
      }
      setSaveDone(true);
      setTimeout(() => {
        setEditing(null);
        setSaveDone(false);
      }, 900);
    } catch {
      setSaveError(copy.errorSave);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setSaveError("");
    setSaveDone(false);
  };

  // ── Weekly schedule handlers (web parity incl. trainingSessions sync) ──
  const saveWeeklySchedule = async () => {
    if (!weeklySchedule || !nutritionProfile) return;
    setWeeklyScheduleSaving(true);
    try {
      const savedSchedule = await upsertWeeklySchedule(weeklySchedule);
      const syncedTrainingSessions = deriveTrainingSessionsFromWeeklySchedule(savedSchedule);
      const updatedProfile = await upsertNutritionProfile({
        ...buildDtoFromStoredProfile(nutritionProfile),
        trainingSessions: syncedTrainingSessions,
      });
      setWeeklySchedule(savedSchedule);
      setNutritionProfile(updatedProfile);
      await reloadResult(updatedProfile);
      setScheduleExpanded(false);
    } catch {
      // stay in the sheet — user can retry (web swallows too)
    } finally {
      setWeeklyScheduleSaving(false);
    }
  };

  const updateDayType = (dayOfWeek: number, newDayType: string) => {
    setWeeklySchedule((prev) =>
      prev
        ? prev.map((d) => {
            if (d.dayOfWeek !== dayOfWeek) return d;
            const workoutTime =
              newDayType === "Training" || newDayType === "HeavyTraining" ? d.workoutTime : "NotSet";
            return { ...d, dayType: newDayType, workoutTime };
          })
        : null
    );
  };

  const applyWorkoutTimeToAll = (newWorkoutTime: string) => {
    setWeeklySchedule((prev) =>
      prev
        ? prev.map((d) =>
            d.dayType === "Training" || d.dayType === "HeavyTraining"
              ? { ...d, workoutTime: newWorkoutTime }
              : d
          )
        : null
    );
  };

  // ── Onboarding-modal actions (approved V1 adaptation: in-app grunddata) ──
  const handleOnboardingNow = async () => {
    setShowOnboardingModal(false);
    await setOnboardingComplete(false).catch(() => {});
    openEdit("grunddata");
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(ACTIVE_ORDER_KEY).catch(() => {});
    await signOut();
  };

  if (nutritionLoading) {
    return (
      <View style={styles.center}>
        <LoadingIndicator />
      </View>
    );
  }

  // ── Derived (web parity) ──
  const np = nutritionProfile;
  const displayResult = nutritionResult;
  const accountEmail = user?.email ?? "";
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) || accountEmail || copy.fallbackName;
  const initials = (() => {
    const source = ((user?.user_metadata?.full_name as string | undefined) || accountEmail || "NU").trim();
    const parts = source.split(/[\s@.]+/).filter(Boolean);
    const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
    return letters.toUpperCase();
  })();
  const identitySub = (() => {
    const goal = np?.primaryGoal ? copy.goalChips[np.primaryGoal] ?? np.primaryGoal : null;
    const activity = np?.activityType ? copy.activityChips[np.activityType] ?? np.activityType : null;
    if (goal && activity) return `${goal} · ${activity}`;
    if (goal) return goal;
    return copy.identityFallback;
  })();

  const showDeviationWarning =
    nutriRecommendation !== null &&
    displayResult?.mode === "CustomMacros" &&
    nutriRecommendation.calorieTarget > 0 &&
    nutriRecommendation.proteinG > 0 &&
    (Math.abs(
      (displayResult.calorieTarget - nutriRecommendation.calorieTarget) /
        nutriRecommendation.calorieTarget
    ) > 0.2 ||
      Math.abs(
        (displayResult.proteinG - nutriRecommendation.proteinG) / nutriRecommendation.proteinG
      ) > 0.2);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* ── Onboarding modal ── */}
      {showOnboardingModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowOnboardingModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <ThemedText style={styles.modalTitle}>{copy.onboardingTitle}</ThemedText>
              <ThemedText style={styles.modalBody}>{copy.onboardingBody}</ThemedText>
              <Pressable
                onPress={handleOnboardingNow}
                style={({ pressed }) => [styles.primaryButton, pressed && { backgroundColor: colors.accentHover }]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.primaryButtonText}>{copy.getStarted}</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setShowOnboardingModal(false)}
                style={styles.secondaryButton}
                accessibilityRole="button"
              >
                <ThemedText style={styles.secondaryButtonText}>{copy.onboardingLater}</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Onboarding resumption banner ── */}
      {isOnboardingComplete === false && (
        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.bannerTitle}>{copy.bannerIncompleteTitle}</ThemedText>
            <ThemedText style={styles.bannerBody}>{copy.bannerIncompleteBody}</ThemedText>
          </View>
          <Pressable
            onPress={() => openEdit("grunddata")}
            style={styles.bannerCta}
            accessibilityRole="button"
          >
            <ThemedText style={styles.bannerCtaText}>{copy.bannerContinue}</ThemedText>
          </Pressable>
        </View>
      )}

      {/* ── 1. Identity row ── */}
      <View style={styles.identityRow}>
        <View style={styles.avatar}>
          <ThemedText style={styles.avatarText}>{initials}</ThemedText>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <ThemedText style={styles.identityName} numberOfLines={1}>
            {displayName}
          </ThemedText>
          <ThemedText style={styles.identitySub} numberOfLines={2}>
            {identitySub}
          </ThemedText>
        </View>
      </View>

      {/* ── 2. DIN AKTIVA PLAN ── */}
      {displayResult && np ? (
        <>
          <View style={styles.sectionHeadRow}>
            <ThemedText style={styles.sectionHead}>{copy.sectionActivePlan.toUpperCase()}</ThemedText>
            <ThemedText style={styles.sectionHeadRight}>{copy.today}</ThemedText>
          </View>
          <View style={styles.planCard}>
            <View style={styles.planTop}>
              <View style={{ gap: 6 }}>
                <ThemedText style={styles.planKcal}>
                  {Math.max(0, Math.round(displayResult.calorieTarget)).toLocaleString("sv-SE")}
                </ThemedText>
                <ThemedText style={styles.planKcalLabel}>{copy.kcalPerDay}</ThemedText>
              </View>
              {displayResult.mode === "CustomMacros" && (
                <View style={styles.manualPill}>
                  <View style={styles.manualDot} />
                  <ThemedText style={styles.manualPillText}>{copy.manual.toUpperCase()}</ThemedText>
                </View>
              )}
            </View>
            <View style={styles.planMacroRow}>
              <ThemedText style={styles.planMacroLabel}>{copy.macroProtein} </ThemedText>
              <ThemedText style={styles.planMacroValue}>{displayResult.proteinG}g</ThemedText>
              <ThemedText style={styles.planMacroDot}> · </ThemedText>
              <ThemedText style={styles.planMacroLabel}>{copy.macroCarbsShort} </ThemedText>
              <ThemedText style={styles.planMacroValue}>{displayResult.carbsG}g</ThemedText>
              <ThemedText style={styles.planMacroDot}> · </ThemedText>
              <ThemedText style={styles.planMacroLabel}>{copy.macroFat} </ThemedText>
              <ThemedText style={styles.planMacroValue}>{displayResult.fatG}g</ThemedText>
            </View>
            <View style={styles.planFooter}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                {displayResult.mode === "CustomMacros" && (
                  <ThemedText style={styles.planNote}>{copy.manualAdjusted}</ThemedText>
                )}
                {displayResult.mode === "CustomMacros" && nutriRecommendation && (
                  <ThemedText style={styles.planNoteDim}>
                    {copy.recommendation(nutriRecommendation.calorieTarget.toLocaleString("sv-SE"))}
                  </ThemedText>
                )}
                {showDeviationWarning && (
                  <ThemedText style={styles.planDeviation}>{copy.deviation}</ThemedText>
                )}
              </View>
              <Pressable
                onPress={() => router.push("/justera-makros")}
                style={styles.changePlanLink}
                accessibilityRole="link"
              >
                <ThemedText style={styles.changePlanText}>{copy.changePlan}</ThemedText>
                <ChevronRight size={12} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>
          </View>
        </>
      ) : np && !np.isComplete ? (
        <View style={styles.planCard}>
          <View style={{ padding: spacing[5], gap: spacing[2] }}>
            <ThemedText style={styles.sectionHead}>{copy.nutritionPlan.toUpperCase()}</ThemedText>
            <ThemedText style={styles.emptyPlanText}>{copy.incompletePlan}</ThemedText>
            {np.missingFields.map((f) => (
              <ThemedText key={f} style={styles.missingField}>
                ·{" "}
                {f === "GoalPace"
                  ? copy.missingGoalPace
                  : f === "MealCount"
                    ? copy.missingMealCount
                    : f}
              </ThemedText>
            ))}
          </View>
        </View>
      ) : !np ? (
        <View style={styles.planCard}>
          <View style={{ padding: spacing[5], gap: spacing[3] }}>
            <ThemedText style={styles.sectionHead}>{copy.nutritionPlan.toUpperCase()}</ThemedText>
            <ThemedText style={styles.emptyPlanText}>{copy.emptyPlan}</ThemedText>
            <Pressable
              onPress={() => openEdit("grunddata")}
              style={({ pressed }) => [
                styles.getStartedButton,
                pressed && { backgroundColor: colors.accentHover },
              ]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.primaryButtonText}>{copy.getStarted}</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ── 3. NÄSTA STEG ── */}
      <ThemedText style={[styles.sectionHead, styles.sectionHeadSpaced]}>
        {copy.nextSteps.toUpperCase()}
      </ThemedText>
      <View style={{ gap: spacing[2] }}>
        <Pressable
          onPress={() => router.navigate("/(tabs)/meny")}
          style={styles.navRow}
          accessibilityRole="button"
        >
          <ThemedText style={styles.navRowText}>{copy.orderFromMenu}</ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.32)" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/kuponger")}
          style={styles.navRow}
          accessibilityRole="button"
        >
          <ThemedText style={styles.navRowText}>{couponCopy.listTitle}</ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.32)" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/poang")}
          style={styles.navRow}
          accessibilityRole="button"
        >
          <ThemedText style={styles.navRowText}>{pointsCopy.screenTitle}</ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.32)" />
        </Pressable>
        <Pressable
          onPress={() => setShowOrders((p) => !p)}
          style={styles.navRow}
          accessibilityRole="button"
          accessibilityState={{ expanded: showOrders }}
        >
          <ThemedText style={styles.navRowText}>{copy.orderHistory}</ThemedText>
          <View style={{ transform: [{ rotate: showOrders ? "90deg" : "0deg" }] }}>
            <ChevronRight size={14} color="rgba(255,255,255,0.32)" />
          </View>
        </Pressable>
        {showOrders && accountEmail ? <OrderHistory email={accountEmail} /> : null}
      </View>

      {/* ── 4. MITT KONTO ── */}
      {np && (
        <>
          <ThemedText style={[styles.sectionHead, styles.sectionHeadSpaced]}>
            {copy.myAccount.toUpperCase()}
          </ThemedText>
          <View style={styles.accountCard}>
            {(
              [
                { label: copy.editBasicData, action: () => openEdit("grunddata") },
                { label: copy.editActivity, action: () => openEdit("aktivitet") },
                { label: copy.editGoal, action: () => openEdit("mal") },
                { label: copy.editTrainingDays, action: () => setScheduleExpanded(true) },
              ] as const
            ).map((row, i, arr) => (
              <Pressable
                key={row.label}
                onPress={row.action}
                style={[styles.accountRow, i < arr.length - 1 && styles.accountRowBorder]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.accountRowText}>{row.label}</ThemedText>
                <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* ── 5. Footer (logout only — no account deletion in V1) ── */}
      <View style={styles.footer}>
        <Pressable onPress={handleLogout} accessibilityRole="button" style={{ padding: spacing[2] }}>
          <ThemedText style={styles.footerLink}>{authCopy.navLogout}</ThemedText>
        </Pressable>
      </View>

      {/* ── Edit modal (section or new-profile variant) ── */}
      {editing && (
        <EditSectionModal
          section={editing}
          isNewProfile={!np}
          form={form}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          saving={saving}
          saveDone={saveDone}
          saveError={saveError}
          onSave={saveEdit}
          onCancel={cancelEdit}
        />
      )}

      {/* ── Training schedule sheet ── */}
      {np && scheduleExpanded && (
        <TrainingScheduleSheet
          schedule={weeklySchedule}
          loading={weeklyScheduleLoading}
          saving={weeklyScheduleSaving}
          onUpdateDayType={updateDayType}
          onApplyWorkoutTimeToAll={applyWorkoutTimeToAll}
          onSave={saveWeeklySchedule}
          onClose={() => setScheduleExpanded(false)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[5],
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 16,
    padding: spacing[6],
    gap: spacing[3],
  },
  modalTitle: { fontSize: 18, fontFamily: fontFamily.bodyBold, color: "#F2EEE8" },
  modalBody: { fontSize: 14, lineHeight: 20, color: "#8A8480" },
  primaryButton: {
    marginTop: spacing[2],
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  secondaryButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: "#8A8480" },

  banner: {
    marginTop: spacing[4],
    marginBottom: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.2)",
    backgroundColor: "#1C1710",
    borderRadius: 16,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  bannerTitle: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: "#F2EEE8" },
  bannerBody: { marginTop: 2, fontSize: 12, color: "#8A8480" },
  bannerCta: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  bannerCtaText: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },

  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: 4,
    paddingVertical: spacing[3],
    marginTop: spacing[2],
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.5,
    color: colors.textPrimary,
  },
  identityName: { fontSize: 17, fontFamily: fontFamily.bodyBold, letterSpacing: -0.4, color: colors.textPrimary },
  identitySub: { fontSize: 12, lineHeight: 16, color: "rgba(255,255,255,0.45)" },

  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 4,
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  sectionHead: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    color: colors.textMuted,
  },
  sectionHeadSpaced: { marginHorizontal: 4, marginTop: spacing[4], marginBottom: spacing[2] },
  sectionHeadRight: { fontSize: 10, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.25)" },

  planCard: {
    backgroundColor: "#17171A",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: "hidden",
  },
  planTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingTop: 22,
    paddingBottom: spacing[2],
  },
  planKcal: {
    fontSize: 34,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.8,
    lineHeight: 38,
    color: colors.textPrimary,
  },
  planKcalLabel: { fontSize: 11.5, color: "rgba(255,255,255,0.42)" },
  manualPill: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  manualDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  manualPillText: {
    fontSize: 10,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 0.4,
    color: "rgba(255,255,255,0.6)",
  },
  planMacroRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[4],
  },
  planMacroLabel: { fontSize: 13, color: "rgba(255,255,255,0.45)" },
  planMacroValue: { fontSize: 13, fontFamily: fontFamily.monoMedium, color: "rgba(255,255,255,0.92)" },
  planMacroDot: { fontSize: 13, color: "rgba(255,255,255,0.18)" },
  planFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  planNote: { fontSize: 11.5, lineHeight: 15, color: "rgba(255,255,255,0.55)" },
  planNoteDim: { fontSize: 11, lineHeight: 14, color: "rgba(255,255,255,0.36)" },
  planDeviation: { fontSize: 11, lineHeight: 14, color: "rgba(232,101,10,0.8)" },
  changePlanLink: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  changePlanText: { fontSize: 12, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.7)" },
  emptyPlanText: { fontSize: 13, lineHeight: 19, color: "rgba(255,255,255,0.55)" },
  missingField: { fontSize: 11, color: "rgba(232,101,10,0.8)" },
  getStartedButton: {
    alignSelf: "flex-start",
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },

  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#17171A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  navRowText: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, letterSpacing: -0.1, color: colors.textPrimary },

  accountCard: {
    backgroundColor: "#17171A",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  accountRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  accountRowText: { fontSize: 14, fontFamily: fontFamily.bodyMedium, letterSpacing: -0.1, color: colors.textPrimary },

  footer: { marginTop: spacing[5], alignItems: "center" },
  footerLink: { fontSize: 12, color: "rgba(255,255,255,0.38)" },
});
