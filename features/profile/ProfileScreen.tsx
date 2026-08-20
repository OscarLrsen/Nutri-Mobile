import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Globe } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { useAuth } from "@/services/auth/AuthProvider";
import { useOnboardingStatus } from "@/services/auth/useOnboardingStatus";
import { supabase } from "@/services/auth/supabase";
import {
  deleteMacroOverride,
  getNutritionProfile,
  getNutritionResult,
  previewNutritionResult,
  upsertMacroOverride,
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
import {
  getMyConsents,
  setEmailMarketingConsent,
  type ApiConsentsResponse,
} from "@/services/api/consents";
import { useTodayDayPlanQuery, useTodayNutritionQuery } from "@/services/api/nutritionQueries";
import {
  deriveActiveDailyNutrition,
  plannedDeviatesFromTarget,
} from "@/features/nutrition/activeDailyNutrition";

import { deriveInitials } from "@/utils/displayName";
import { useDisplayName } from "@/services/auth/useDisplayName";
import { openPolicy } from "@/utils/webUrls";
import { ActiveOrderBanner } from "@/features/order/ActiveOrderBanner";
import { TRAINING_DAYS_ENABLED } from "./featureFlags";
import { LanguagePickerSheet } from "@/components/language/LanguagePickerSheet";
import { SUPPORTED_LANGUAGES, formatNumber, useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";
import {
  deriveTrainingSessionsFromWeeklySchedule,
} from "./profileOptions";
import { EditSectionModal, type EditSection } from "./EditSectionModal";
import {
  formFromProfile,
  hasValidAge,
  hasValidHeight,
  hasValidWeight,
  isProfileComplete,
  menopauseToApi,
  type ProfileFormState,
} from "./profileRequirements";
import { deriveProfileCompletion } from "./profileCompletion";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { TrainingScheduleSheet } from "./TrainingScheduleSheet";
import { OrderHistory } from "./OrderHistory";
import { PushNotificationsSection } from "@/features/push/PushNotificationsSection";

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

/**
 * A brand-new profile starts EMPTY, not defaulted. The old EMPTY_FORM
 * pre-answered gender as Male, activity as Mixed and the goal as Maintain;
 * combined with an onboarding sheet that never showed those fields, a first
 * run saved a profile the customer had not described. Null means unanswered,
 * and the sheet will not save until it is answered.
 */
const EMPTY_FORM: ProfileFormState = {
  gender: null,
  ageYears: "",
  weightKg: "",
  heightCm: "",
  bodyFatLevel: null,
  activityType: null,
  stepsRange: null,
  trainingSessions: null,
  primaryGoal: null,
  goalPace: null,
  planFocus: null,
  menopause: null,
  cyclePhase: null,
};

// formFromProfile now lives in profileRequirements, next to the rules that
// decide whether the result is complete — the screen and the completion
// check must read a stored profile the same way.

/**
 * How far Nutri's recalculated recommendation must move before the weight
 * dialog asks about it. The engine rounds targets to 10 kcal, so tiny
 * fluctuations below this are noise, not a decision the customer should make.
 */
const CALORIE_SUGGESTION_THRESHOLD_KCAL = 50;

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
  const { isOnboardingComplete, isKnown: onboardingKnown } = useOnboardingStatus();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);

  // ── Nutrition profile state ──
  const [nutritionProfile, setNutritionProfile] = useState<ApiNutritionProfile | null>(null);
  const [nutritionResult, setNutritionResult] = useState<ApiNutritionResult | null>(null);
  const [nutriRecommendation, setNutriRecommendation] = useState<ApiNutritionResult | null>(null);
  const [nutritionLoading, setNutritionLoading] = useState(true);

  // Today's ACTIVE goal + saved plan (patch 13) — the SAME shared query
  // rows Home and the menu use, so the "Idag"-row can never disagree with
  // them. Silent on error: the baseline card renders as before.
  const todayQuery = useTodayNutritionQuery();
  const dayPlanQuery = useTodayDayPlanQuery();
  const today = todayQuery.data;
  const activeToday = deriveActiveDailyNutrition(today, dayPlanQuery.data);
  const plannedDeviates = activeToday !== null && plannedDeviatesFromTarget(activeToday);

  // ── UI state ──
  const [editing, setEditing] = useState<EditSection | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveDone, setSaveDone] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showOrders, setShowOrders] = useState(false);

  // Release P14: the previous weight, for the "senaste förändring" line.
  // Device-local — the backend keeps no weight history.
  const [prevWeight, setPrevWeight] = useState<number | null>(null);
  useEffect(() => {
    if (!user) {
      setPrevWeight(null);
      return;
    }
    AsyncStorage.getItem(`nutri_weight_prev_${user.id}`)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as { weightKg?: number };
        if (typeof parsed.weightKg === "number") setPrevWeight(parsed.weightKg);
      })
      .catch(() => {});
  }, [user]);

  // ── Weekly schedule state ──
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklyScheduleDto[] | null>(null);
  const [weeklyScheduleLoading, setWeeklyScheduleLoading] = useState(false);
  const [weeklyScheduleSaving, setWeeklyScheduleSaving] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);

  /**
   * Null when the form has not answered everything the engine needs — the
   * caller refuses to save rather than substituting a default. Every
   * algorithm field is sent from the FORM, including the two the old
   * version left out entirely: PUT /nutrition-profile assigns
   * IsPostmenopausal and CyclePhase unconditionally, so omitting them wiped
   * a cycle phase set on the web and moved the luteal target by 100 kcal on
   * every unrelated edit (the same wipe the P14 comment below describes for
   * the goal weight).
   */
  const buildDto = useCallback((): UpsertNutritionProfileDto | null => {
    if (!isProfileComplete(form)) return null;
    return {
      gender: form.gender!,
      ageYears: parseInt(form.ageYears),
      weightKg: parseFloat(form.weightKg),
      heightCm: parseInt(form.heightCm),
      bodyFatLevel: form.bodyFatLevel,
      // Release P14: PRESERVE any stored goal weight — the old hard-coded
      // null silently wiped it on every save. Current weight and goal weight
      // are separate facts; only the current one is edited here. (The engine
      // never reads it; it is a display fact.)
      targetWeightKg: nutritionProfile?.targetWeightKg ?? null,
      activityType: form.activityType!,
      stepsRange: form.stepsRange,
      trainingSessions: form.trainingSessions,
      primaryGoal: form.primaryGoal!,
      goalPace: form.primaryGoal === "Maintain" ? null : form.goalPace,
      mealCountMain: 3,
      mealCountSnacks: 1,
      planFocus: form.planFocus,
      isPostmenopausal: menopauseToApi(form.menopause),
      // The engine ignores the phase unless there is an active cycle.
      cyclePhase: form.menopause === "Cycling" ? form.cyclePhase : null,
    };
  }, [form, nutritionProfile]);

  // Patch 13: reloadResult is now ALSO triggered by the shared nutrition
  // query's refetch stamp (see the sync effect below), so it can resolve
  // after this screen is gone — a tab swap, or logout unmounting the whole
  // signed-in stack. Guard every setState behind a mounted flag instead of
  // leaving a second unguarded async path behind.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Active targets + (when overridden) Nutri's own recommendation (web parity).
  const reloadResult = useCallback(async (forProfile?: ApiNutritionProfile | null) => {
    try {
      const result = await getNutritionResult();
      if (!mountedRef.current) return;
      setNutritionResult(result);
      if (result.mode === "Auto") {
        setNutriRecommendation(result);
      } else if (forProfile) {
        try {
          const preview = await previewNutritionResult(buildDtoFromStoredProfile(forProfile));
          if (!mountedRef.current) return;
          setNutriRecommendation(preview);
        } catch {
          if (mountedRef.current) setNutriRecommendation(null);
        }
      }
    } catch {
      if (!mountedRef.current) return;
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

  // Patch 13: the baseline card (nutritionResult) is loaded imperatively
  // outside React Query (web-parity port). Without this, a macro override
  // saved on Justera makros — or any mutation that invalidates
  // ["nutrition"] — would refresh Home while Profile kept rendering the
  // OLD baseline: exactly the tab-dependent contradiction this patch
  // removes. The shared today-query is mounted here, so its refetch stamp
  // is the one signal that covers every such mutation. The first observed
  // stamp is only recorded (the initial load already fetched); later
  // changes trigger a re-read of /result.
  const lastNutritionSyncRef = useRef(0);
  useEffect(() => {
    const stamp = todayQuery.dataUpdatedAt;
    if (!stamp || nutritionProfile?.isComplete !== true) return;
    if (lastNutritionSyncRef.current === 0) {
      lastNutritionSyncRef.current = stamp;
      return;
    }
    if (stamp === lastNutritionSyncRef.current) return;
    lastNutritionSyncRef.current = stamp;
    void reloadResult(nutritionProfile);
  }, [todayQuery.dataUpdatedAt, nutritionProfile, reloadResult]);

  // ── What this customer should be told about their profile ──────────
  //
  // ONE derivation, from profileCompletion.ts. It used to be two unrelated
  // checks against the Supabase flag, and that flag reads `null` while it is
  // still loading and `null` again when the read fails — the same value that
  // means "never onboarded". So the "Welcome to Nutri!" modal appeared on
  // cold starts and network hiccups for customers who had onboarded long
  // ago. The stored nutrition profile is now the evidence; the flag is only
  // consulted when there is no profile to look at.
  const completion = deriveProfileCompletion({
    onboardingFlag: isOnboardingComplete,
    onboardingKnown: onboardingKnown,
    profileLoading: nutritionLoading,
    profile: nutritionProfile,
  });

  // The welcome modal is now reachable ONLY by a genuine first-time user.
  useEffect(() => {
    if (completion.state === "new-user") setShowOnboardingModal(true);
    else setShowOnboardingModal(false);
  }, [completion.state]);

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
    if (nutritionProfile) setForm(formFromProfile(nutritionProfile));
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
    // Every section that carries the basic numbers validates them — the
    // combined page (P13) and the weight quick-edit (P14) included. The
    // bounds live in profileRequirements so this check and the sheet's
    // completeness gate can never disagree about what "filled in" means.
    if (editing === "grunddata" || editing === "profil" || editing === "vikt") {
      const basicsOk =
        editing === "vikt"
          ? hasValidWeight(form)
          : hasValidAge(form) && hasValidWeight(form) && hasValidHeight(form);
      if (!basicsOk) {
        setSaveError(t("profile.errorInvalidBasics"));
        setSaving(false);
        return;
      }
    }

    // The weight quick-edit shows ONE number, so it must not be gated on
    // fields it cannot display: it saves the stored profile with the new
    // weight. Anything the customer skipped under the old form stays exactly
    // as stored instead of being re-defaulted — the full editor is where
    // those gaps get filled.
    const dto =
      editing === "vikt" && nutritionProfile
        ? { ...buildDtoFromStoredProfile(nutritionProfile), weightKg: parseFloat(form.weightKg) }
        : buildDto();
    if (!dto) {
      setSaveError(t("profile.errorIncomplete"));
      setSaving(false);
      return;
    }

    try {
      const previousWeight = nutritionProfile?.weightKg ?? null;
      // The goal the customer actually had SAVED before this change —
      // override-applied. Captured here because reloadResult below replaces
      // the state with the post-change numbers.
      const previousResult = nutritionResult;
      const wasIncomplete = isOnboardingComplete !== true;
      const updated = await upsertNutritionProfile(dto);
      setNutritionProfile(updated);
      // Patch 13: a profile change alters today's goal — refresh every
      // shared nutrition query so Home/Meny/Planera din dag follow.
      void queryClient.invalidateQueries({ queryKey: ["nutrition"] });

      // Release P14: remember the OLD weight when it changed, so the weight
      // row can show a simple "senaste förändring" — device-local because
      // the backend keeps no weight history (documented limitation).
      if (
        user &&
        previousWeight !== null &&
        Math.abs(updated.weightKg - previousWeight) >= 0.1
      ) {
        setPrevWeight(previousWeight);
        void AsyncStorage.setItem(
          `nutri_weight_prev_${user.id}`,
          JSON.stringify({ weightKg: previousWeight, at: new Date().toISOString() }),
        ).catch(() => {});
      }

      if (updated.isComplete) {
        await reloadResult(updated);
        if (isOnboardingComplete !== true) {
          await setOnboardingComplete(true).catch(() => {});
        }
      } else {
        setNutritionResult(null);
      }

      // Release P17: a FIRST-TIME completed onboarding lands in the menu,
      // immediately and without passing Home — the customer can start
      // ordering right away. One-shot by construction: the flag flips to
      // true above, so this branch can never re-trigger.
      if (wasIncomplete && updated.isComplete) {
        setEditing(null);
        setSaveDone(false);
        router.replace("/(tabs)/meny");
        return;
      }

      setSaveDone(true);
      setTimeout(() => {
        setEditing(null);
        setSaveDone(false);
      }, 900);

      // ── Weight changed → offer Nutri's recalculated goal ────────────────
      //
      // AFTER the modal-close flow so the sheet dismisses normally; the
      // native dialog then owns the screen. The weight itself is already
      // saved above whatever the customer answers — the question is only
      // about the GOAL.
      const weightChanged =
        previousWeight !== null && Math.abs(updated.weightKg - previousWeight) >= 0.1;
      if (updated.isComplete && weightChanged && previousResult !== null) {
        void maybeOfferRecalculatedGoal(updated, previousResult);
      }
    } catch {
      setSaveError(t("profile.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  // ── Weight → calorie recommendation ───────────────────────────────────
  //
  // THE THREE NUMBERS ARE KEPT APART. `recommended` is Nutri's server-side
  // recommendation for the NEW weight — the same engine onboarding uses,
  // fetched via /preview, never computed on the device. `previousGoal` is
  // the goal the customer had SAVED before the change (override-applied).
  // The macro-derived target never enters the comparison separately — when
  // an override exists it IS the saved goal, and in Auto mode the saved
  // goal IS the recommendation.
  const maybeOfferRecalculatedGoal = async (
    updated: ApiNutritionProfile,
    previousResult: ApiNutritionResult,
  ) => {
    const previousGoal = Math.round(previousResult.calorieTarget);
    if (previousGoal <= 0) return;

    let recommended: number;
    try {
      const preview = await previewNutritionResult(buildDtoFromStoredProfile(updated));
      recommended = Math.round(preview.calorieTarget);
    } catch {
      return; // no server recommendation — nothing honest to ask about
    }

    if (Math.abs(recommended - previousGoal) < CALORIE_SUGGESTION_THRESHOLD_KCAL) return;
    if (!mountedRef.current) return;

    const wasAuto = previousResult.mode === "Auto";

    Alert.alert(
      t("profile.weightGoalTitle"),
      t("profile.weightGoalBody", {
        current: formatNumber(previousGoal, language),
        recommended: formatNumber(recommended, language),
      }),
      [
        {
          text: t("profile.weightGoalKeep"),
          style: "cancel",
          onPress: () => {
            void answerRecalculatedGoal(updated, previousResult, wasAuto, false);
          },
        },
        {
          text: t("profile.weightGoalUpdate"),
          onPress: () => {
            void answerRecalculatedGoal(updated, previousResult, wasAuto, true);
          },
        },
      ],
      { cancelable: false },
    );
  };

  const answerRecalculatedGoal = async (
    updated: ApiNutritionProfile,
    previousResult: ApiNutritionResult,
    wasAuto: boolean,
    adoptRecommendation: boolean,
  ) => {
    try {
      if (adoptRecommendation && !wasAuto) {
        // Follow Nutri again: dropping the override makes the goal (and the
        // macros derived from it) track the recommendation — one source of
        // truth, no copied numbers.
        await deleteMacroOverride();
      } else if (!adoptRecommendation && wasAuto) {
        // Keep the previous goal: in Auto mode the goal has already moved
        // with the new weight, so keeping it means pinning the OLD result
        // as an override — the customer's explicit choice, stored where
        // chosen goals live.
        await upsertMacroOverride({
          proteinG: previousResult.proteinG,
          carbsG: previousResult.carbsG,
          fatG: previousResult.fatG,
          fiberG: previousResult.fiberG,
          userCalorieTarget: Math.round(previousResult.calorieTarget),
        });
      }
      // The other two combinations need no write: adopt+Auto already tracks,
      // keep+override already holds the customer's number.
    } catch {
      // The weight is saved either way; the goal write failing must not
      // strand the screen — the resync below shows whatever is stored.
    }

    await reloadResult(updated);
    void queryClient.invalidateQueries({ queryKey: ["nutrition"] });
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
      // Patch 13: day types drive carb cycling — refresh shared queries.
      void queryClient.invalidateQueries({ queryKey: ["nutrition"] });
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

  // ── Newsletter consent — REAL backend state (GET /api/consents/me), not
  // local state or legacy Supabase metadata. The toggle writes through the
  // backend (source of truth) and re-caches the returned state; on failure
  // the cache is invalidated so the switch snaps back to the truth.
  const consentsQuery = useQuery({
    queryKey: ["consents", "me"],
    queryFn: getMyConsents,
    enabled: !!user,
    staleTime: 60_000,
  });
  const [consentSaveError, setConsentSaveError] = useState(false);
  // Monotonic ticket per toggle: a slow response from an EARLIER tap must
  // never overwrite the state of a later one (release P21's race guard).
  const marketingTicketRef = useRef(0);
  const marketingMutation = useMutation({
    mutationFn: setEmailMarketingConsent,
    // Release P21: OPTIMISTIC. The switch answers the finger immediately —
    // the old flow disabled the row and waited for the round-trip, which
    // read as "laggy or broken". The cache flips at once; a failure rolls
    // back and re-reads the server truth.
    onMutate: async (granted: boolean) => {
      const ticket = ++marketingTicketRef.current;
      setConsentSaveError(false);
      await queryClient.cancelQueries({ queryKey: ["consents", "me"] });
      const previous = queryClient.getQueryData<ApiConsentsResponse>(["consents", "me"]);
      if (previous) {
        queryClient.setQueryData<ApiConsentsResponse>(["consents", "me"], {
          ...previous,
          emailMarketingActive: granted,
        });
      }
      return { previous, ticket };
    },
    onSuccess: (data: ApiConsentsResponse, _granted, context) => {
      if (context?.ticket !== marketingTicketRef.current) return;
      setConsentSaveError(false);
      queryClient.setQueryData(["consents", "me"], data);
    },
    onError: (_error, _granted, context) => {
      if (context?.ticket !== marketingTicketRef.current) return;
      setConsentSaveError(true);
      if (context?.previous) {
        queryClient.setQueryData(["consents", "me"], context.previous);
      }
      void queryClient.invalidateQueries({ queryKey: ["consents", "me"] });
    },
  });

  // ── Onboarding-modal actions (approved V1 adaptation: in-app grunddata) ──
  const handleOnboardingNow = async () => {
    setShowOnboardingModal(false);
    await setOnboardingComplete(false).catch(() => {});
    openEdit("grunddata");
  };

  const handleLogout = async () => {
    // signOut() clears the followed order centrally (AuthProvider), so every
    // sign-out path behaves identically. Removing the key here only dropped it
    // from storage — not from the store that already-mounted banners read.
    await signOut();
  };

  // Shared with Hem's greeting (bug 5): real name or null — the e-mail
  // never renders as a NAME (it still shows in the account rows where it
  // belongs). Called BEFORE the loading early-return — hooks run
  // unconditionally.
  const displayName = useDisplayName() ?? t("profile.fallbackName");

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
  // displayName comes from useDisplayName above (same source as Hem's
  // greeting); initials keep the pure util (two letters can't flash a
  // full address).
  const initials = deriveInitials(user);
  const identitySub = (() => {
    const goal = np?.primaryGoal
      ? t(`profile.goalChips.${np.primaryGoal}`, { defaultValue: np.primaryGoal })
      : null;
    const activity = np?.activityType
      ? t(`profile.activityChips.${np.activityType}`, { defaultValue: np.activityType })
      : null;
    if (goal && activity) return `${goal} · ${activity}`;
    if (goal) return goal;
    return t("profile.identityFallback");
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
      {/* The live order follows the customer here too (P2). */}
      <ActiveOrderBanner />
      {/* ── Onboarding modal ── */}
      {showOnboardingModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowOnboardingModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <ThemedText style={styles.modalTitle}>{t("profile.onboardingTitle")}</ThemedText>
              <ThemedText style={styles.modalBody}>{t("profile.onboardingBody")}</ThemedText>
              <Pressable
                onPress={handleOnboardingNow}
                style={({ pressed }) => [styles.primaryButton, pressed && { backgroundColor: colors.accentHover }]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.primaryButtonText}>{t("profile.getStarted")}</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setShowOnboardingModal(false)}
                style={styles.secondaryButton}
                accessibilityRole="button"
              >
                <ThemedText style={styles.secondaryButtonText}>{t("profile.onboardingLater")}</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* ── "Complete your profile" — for RETURNING customers only ──
          Never a welcome. This is the state a long-standing customer lands
          in when their stored profile predates fields the engine now reads;
          the copy says so, and the CTA opens the full editor, which lists
          exactly what is missing. A first-time user gets the modal above
          instead, and a complete profile gets nothing at all. */}
      {completion.state === "needs-completion" && (
        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.bannerTitle}>{t("profile.bannerIncompleteTitle")}</ThemedText>
            <ThemedText style={styles.bannerBody}>{t("profile.bannerIncompleteBody")}</ThemedText>
          </View>
          <Pressable
            onPress={() => openEdit(nutritionProfile ? "profil" : "grunddata")}
            style={styles.bannerCta}
            accessibilityRole="button"
          >
            <ThemedText style={styles.bannerCtaText}>{t("profile.bannerContinue")}</ThemedText>
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

      {/* ── 2. DIN AKTIVA PLAN — the BASELINE plan (/result). Patch 13:
          the byline says "Grundplan" (it previously claimed "Idag" while
          showing the baseline), and a separate "Idag"-row below shows the
          day's ACTIVE goal (carb-cycled adjustedTarget) — the exact same
          number Home's Dagens plan and Dagens status use. ── */}
      {displayResult && np ? (
        <>
          <View style={styles.sectionHeadRow}>
            <ThemedText style={styles.sectionHead}>{t("profile.sectionActivePlan").toUpperCase()}</ThemedText>
            <ThemedText style={styles.sectionHeadRight}>{t("profile.baselineLabel")}</ThemedText>
          </View>
          <View style={styles.planCard}>
            <View style={styles.planTop}>
              <View style={{ gap: 6 }}>
                <ThemedText style={styles.planKcal}>
                  {formatNumber(Math.max(0, Math.round(displayResult.calorieTarget)), language)}
                </ThemedText>
                <ThemedText style={styles.planKcalLabel}>{t("profile.kcalPerDay")}</ThemedText>
              </View>
              {displayResult.mode === "CustomMacros" && (
                <View style={styles.manualPill}>
                  <View style={styles.manualDot} />
                  <ThemedText style={styles.manualPillText}>{t("profile.manual").toUpperCase()}</ThemedText>
                </View>
              )}
            </View>
            <View style={styles.planMacroRow}>
              <ThemedText style={styles.planMacroLabel}>{t("profile.macroProtein")} </ThemedText>
              <ThemedText style={styles.planMacroValue}>{displayResult.proteinG}g</ThemedText>
              <ThemedText style={styles.planMacroDot}> · </ThemedText>
              <ThemedText style={styles.planMacroLabel}>{t("profile.macroCarbsShort")} </ThemedText>
              <ThemedText style={styles.planMacroValue}>{displayResult.carbsG}g</ThemedText>
              <ThemedText style={styles.planMacroDot}> · </ThemedText>
              <ThemedText style={styles.planMacroLabel}>{t("profile.macroFat")} </ThemedText>
              <ThemedText style={styles.planMacroValue}>{displayResult.fatG}g</ThemedText>
            </View>

            {/* Today's ACTIVE goal (patch 13) — same shared query/model as
                Home. Shown only when it differs from the baseline (a
                day-type adjustment) so equal numbers never repeat. */}
            {activeToday && activeToday.target.calories !== displayResult.calorieTarget ? (
              <View style={styles.todayRow}>
                <ThemedText style={styles.todayRowLabel}>
                  {t("profile.todayGoalRow", {
                    dayType: today?.dayType
                      ? t(`profile.dayTypeNames.${today.dayType}`, {
                          defaultValue: today.dayType,
                        })
                      : t("profile.todayGoalFallbackDay"),
                  }).toUpperCase()}
                </ThemedText>
                <ThemedText style={styles.todayRowValue}>
                  {formatNumber(activeToday.target.calories, language)} kcal ·{" "}
                  {activeToday.target.proteinG}g {t("profile.macroProtein").toLowerCase()} ·{" "}
                  {activeToday.target.carbsG}g {t("profile.macroCarbsShort").toLowerCase()} ·{" "}
                  {activeToday.target.fatG}g {t("profile.macroFat").toLowerCase()}
                </ThemedText>
                {activeToday.planned && plannedDeviates ? (
                  <ThemedText style={styles.todayRowPlanned}>
                    {t("profile.plannedToday", {
                      kcal: formatNumber(activeToday.planned.calories, language),
                    })}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}
            <View style={styles.planFooter}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                {displayResult.mode === "CustomMacros" && (
                  <ThemedText style={styles.planNote}>{t("profile.manualAdjusted")}</ThemedText>
                )}
                {displayResult.mode === "CustomMacros" && nutriRecommendation && (
                  <ThemedText style={styles.planNoteDim}>
                    {t("profile.recommendation", {
                      calories: formatNumber(nutriRecommendation.calorieTarget, language),
                    })}
                  </ThemedText>
                )}
                {showDeviationWarning && (
                  <ThemedText style={styles.planDeviation}>{t("profile.deviation")}</ThemedText>
                )}
              </View>
              <Pressable
                onPress={() => router.push("/justera-makros")}
                style={styles.changePlanLink}
                accessibilityRole="link"
              >
                <ThemedText style={styles.changePlanText}>{t("profile.changePlan")}</ThemedText>
                <ChevronRight size={12} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>
          </View>
        </>
      ) : np && !np.isComplete ? (
        <View style={styles.planCard}>
          <View style={{ padding: spacing[5], gap: spacing[2] }}>
            <ThemedText style={styles.sectionHead}>{t("profile.nutritionPlan").toUpperCase()}</ThemedText>
            <ThemedText style={styles.emptyPlanText}>{t("profile.incompletePlan")}</ThemedText>
            {np.missingFields.map((f) => (
              <ThemedText key={f} style={styles.missingField}>
                ·{" "}
                {f === "GoalPace"
                  ? t("profile.missingGoalPace")
                  : f === "MealCount"
                    ? t("profile.missingMealCount")
                    : f}
              </ThemedText>
            ))}
          </View>
        </View>
      ) : !np ? (
        <View style={styles.planCard}>
          <View style={{ padding: spacing[5], gap: spacing[3] }}>
            <ThemedText style={styles.sectionHead}>{t("profile.nutritionPlan").toUpperCase()}</ThemedText>
            <ThemedText style={styles.emptyPlanText}>{t("profile.emptyPlan")}</ThemedText>
            <Pressable
              onPress={() => openEdit("grunddata")}
              style={({ pressed }) => [
                styles.getStartedButton,
                pressed && { backgroundColor: colors.accentHover },
              ]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.primaryButtonText}>{t("profile.getStarted")}</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ── 3. MITT KONTO — moved directly under the active plan (release
          QA): the account basics are what the customer comes here to change,
          so they must not sit below the navigation rows. Release P13: ONE
          combined profile page instead of four small sub-modals, plus the
          weight row (P14). The training-days entry is hidden behind
          TRAINING_DAYS_ENABLED (P16) — data and backend stay untouched,
          flip the flag to bring it back. ── */}
      {np && (
        <>
          <ThemedText style={[styles.sectionHead, styles.sectionHeadSpaced]}>
            {t("profile.myAccount").toUpperCase()}
          </ThemedText>
          <View style={styles.accountCard}>
            <Pressable
              onPress={() => openEdit("profil")}
              style={[styles.accountRow, styles.accountRowBorder]}
              accessibilityRole="button"
              accessibilityLabel={t("profile.editProfile")}
            >
              <ThemedText style={styles.accountRowText}>{t("profile.editProfile")}</ThemedText>
              <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
            </Pressable>
            <Pressable
              onPress={() => openEdit("vikt")}
              style={[
                styles.accountRow,
                TRAINING_DAYS_ENABLED && styles.accountRowBorder,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("profile.weightRow")}
            >
              <View style={{ flex: 1, paddingRight: spacing[3] }}>
                <ThemedText style={styles.accountRowText}>{t("profile.weightRow")}</ThemedText>
                <ThemedText style={styles.consentRowHint}>
                  {np.weightKg
                    ? prevWeight !== null && Math.abs(prevWeight - np.weightKg) >= 0.1
                      ? t("profile.weightRowDelta", {
                          weight: np.weightKg,
                          delta: `${np.weightKg > prevWeight ? "+" : "−"}${Math.abs(
                            Math.round((np.weightKg - prevWeight) * 10) / 10,
                          )}`,
                        })
                      : t("profile.weightRowCurrent", { weight: np.weightKg })
                    : t("profile.weightRowEmpty")}
                </ThemedText>
              </View>
              <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
            </Pressable>
            {TRAINING_DAYS_ENABLED ? (
              <Pressable
                onPress={() => setScheduleExpanded(true)}
                style={styles.accountRow}
                accessibilityRole="button"
              >
                <ThemedText style={styles.accountRowText}>
                  {t("profile.editTrainingDays")}
                </ThemedText>
                <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
              </Pressable>
            ) : null}
          </View>
        </>
      )}

      {/* ── 4. NÄSTA STEG ── */}
      <ThemedText style={[styles.sectionHead, styles.sectionHeadSpaced]}>
        {t("profile.nextSteps").toUpperCase()}
      </ThemedText>
      <View style={{ gap: spacing[2] }}>
        <Pressable
          onPress={() => router.navigate("/(tabs)/meny")}
          style={styles.navRow}
          accessibilityRole="button"
        >
          <ThemedText style={styles.navRowText}>{t("profile.orderFromMenu")}</ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.32)" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/kuponger")}
          style={styles.navRow}
          accessibilityRole="button"
        >
          <ThemedText style={styles.navRowText}>{t("coupon.listTitle")}</ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.32)" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/poang")}
          style={styles.navRow}
          accessibilityRole="button"
        >
          <ThemedText style={styles.navRowText}>{t("points.screenTitle")}</ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.32)" />
        </Pressable>
        <Pressable
          onPress={() => setShowOrders((p) => !p)}
          style={styles.navRow}
          accessibilityRole="button"
          accessibilityState={{ expanded: showOrders }}
        >
          <ThemedText style={styles.navRowText}>{t("profile.orderHistory")}</ThemedText>
          <View style={{ transform: [{ rotate: showOrders ? "90deg" : "0deg" }] }}>
            <ChevronRight size={14} color="rgba(255,255,255,0.32)" />
          </View>
        </Pressable>
        {showOrders && accountEmail ? <OrderHistory email={accountEmail} /> : null}
      </View>

      {/* ── 4b. Språk — always rendered (also without a nutrition profile) ── */}
      <ThemedText style={[styles.sectionHead, styles.sectionHeadSpaced]}>
        {t("language.title").toUpperCase()}
      </ThemedText>
      <View style={styles.accountCard}>
        <Pressable
          onPress={() => setLanguageSheetOpen(true)}
          style={styles.accountRow}
          accessibilityRole="button"
          accessibilityLabel={t("language.changeLanguage")}
          accessibilityValue={{
            text: SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeLabel,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[3] }}>
            <Globe size={14} color="rgba(255,255,255,0.55)" strokeWidth={1.8} />
            <ThemedText style={styles.accountRowText}>{t("language.title")}</ThemedText>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[2] }}>
            <ThemedText style={styles.languageValue}>
              {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeLabel}
            </ThemedText>
            <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
          </View>
        </Pressable>
      </View>

      {/* ── 4c. Om appen — replay the first-run intro (patch 3). Never
          touches the first-run flag or auth; the route navigates back
          here when done. ── */}
      <ThemedText style={[styles.sectionHead, styles.sectionHeadSpaced]}>
        {t("onboarding.profileSection").toUpperCase()}
      </ThemedText>
      <View style={styles.accountCard}>
        <Pressable
          onPress={() => router.push("/om-nutri")}
          style={styles.accountRow}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.profileRow")}
        >
          <ThemedText style={styles.accountRowText}>{t("onboarding.profileRow")}</ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
        </Pressable>
      </View>

      {/* ── 4d. Feedback och support — feedback + problem report forms
          (patch 6). Plain navigation rows; the forms own all state. ── */}
      <ThemedText style={[styles.sectionHead, styles.sectionHeadSpaced]}>
        {t("appFeedback.profileSection").toUpperCase()}
      </ThemedText>
      <View style={styles.accountCard}>
        <Pressable
          onPress={() => router.push("/feedback")}
          style={[styles.accountRow, styles.accountRowBorder]}
          accessibilityRole="button"
          accessibilityLabel={t("appFeedback.profileFeedbackRow")}
        >
          <ThemedText style={styles.accountRowText}>
            {t("appFeedback.profileFeedbackRow")}
          </ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/rapportera-problem")}
          style={styles.accountRow}
          accessibilityRole="button"
          accessibilityLabel={t("appFeedback.profileBugRow")}
        >
          <ThemedText style={styles.accountRowText}>
            {t("appFeedback.profileBugRow")}
          </ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
        </Pressable>
      </View>

      {/* ── 4e. Notiser (patch 10) — OS status + per-device category
          toggles; hides itself on simulators where push can't work. ── */}
      <PushNotificationsSection />

      {/* ── 4f. Nyhetsbrev & villkor — real backend consent state ── */}
      <ThemedText style={[styles.sectionHead, styles.sectionHeadSpaced]}>
        {t("consents.sectionTitle").toUpperCase()}
      </ThemedText>
      <View style={styles.accountCard}>
        <View style={[styles.accountRow, styles.accountRowBorder]}>
          <View style={{ flex: 1, paddingRight: spacing[3] }}>
            <ThemedText style={styles.accountRowText}>{t("consents.newsletterLabel")}</ThemedText>
            <ThemedText
              style={[styles.consentRowHint, consentSaveError ? styles.consentRowHintError : null]}
            >
              {consentSaveError ? t("consents.updateError") : t("consents.newsletterHint")}
            </ThemedText>
          </View>
          <Switch
            value={consentsQuery.data?.emailMarketingActive ?? false}
            // Only the initial load disables the row — the toggle itself is
            // optimistic and answers immediately (P21).
            disabled={consentsQuery.isPending}
            onValueChange={(next) => marketingMutation.mutate(next)}
            trackColor={{ false: "rgba(255,255,255,0.12)", true: colors.accent }}
            thumbColor="#fff"
            accessibilityLabel={t("consents.newsletterLabel")}
          />
        </View>
        <Pressable
          onPress={() => void openPolicy("kopvillkor", language)}
          style={[styles.accountRow, styles.accountRowBorder]}
          accessibilityRole="link"
        >
          <ThemedText style={styles.accountRowText}>{t("consents.termsRow")}</ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
        </Pressable>
        <Pressable
          onPress={() => void openPolicy("integritet", language)}
          style={styles.accountRow}
          accessibilityRole="link"
        >
          <ThemedText style={styles.accountRowText}>{t("consents.privacyRow")}</ThemedText>
          <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
        </Pressable>
      </View>

      {/* ── 5. Footer — sign out, then account deletion ──
          Deletion sits below sign-out and renders as small destructive text
          rather than a button: it must be findable, never prominent. */}
      <View style={styles.footer}>
        <Pressable onPress={handleLogout} accessibilityRole="button" style={{ padding: spacing[2] }}>
          <ThemedText style={styles.footerLink}>{t("auth.navLogout")}</ThemedText>
        </Pressable>
        <DeleteAccountSection />
      </View>

      {/* ── Language picker sheet ── */}
      <LanguagePickerSheet
        visible={languageSheetOpen}
        onClose={() => setLanguageSheetOpen(false)}
      />

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

      {/* ── Training schedule sheet — hidden with the entry (P16) ── */}
      {TRAINING_DAYS_ENABLED && np && scheduleExpanded && (
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
  todayRow: {
    gap: 3,
    marginHorizontal: spacing[5],
    marginBottom: spacing[3],
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  todayRowLabel: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  todayRowValue: { fontSize: 12.5, fontFamily: fontFamily.monoMedium, color: "rgba(255,255,255,0.92)" },
  todayRowPlanned: { fontSize: 11, lineHeight: 14, color: "rgba(255,255,255,0.5)" },
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
  consentRowHint: { marginTop: 2, fontSize: 11.5, lineHeight: 15, color: colors.textSecondary },
  consentRowHintError: { color: "#F87171" },
  languageValue: { fontSize: 13, color: colors.textSecondary, letterSpacing: -0.1 },

  footer: { marginTop: spacing[5], alignItems: "center" },
  footerLink: { fontSize: 12, color: "rgba(255,255,255,0.38)" },
});
