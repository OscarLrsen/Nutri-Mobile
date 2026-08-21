import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Check, Package, RotateCcw } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import {
  DAY_PLAN_QUERY_PREFIX,
  isProfileGapError,
  useTodayDayPlanQuery,
  useTodayNutritionQuery,
} from "@/services/api/nutritionQueries";
import { saveTodayDayPlan, type SavedMealSlotDto } from "@/services/api/dayPlan";
import { useQueryClient } from "@tanstack/react-query";
import type { ApiMealDistribution } from "@/services/api/nutrition";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { DayPlanSlotList } from "./DayPlanSlotList";
import { draftFor, EMPTY_DRAFT, isSlotEditable, visibleSlotsFor, type SlotDraft } from "./dayPlanSlots";

/**
 * "Planera din dag" (patch 12) — the mobile port of the web's existing
 * DaySetupPlanner (src/components/profile/DaySetupPlanner.tsx). ALL rules
 * are the web's, ported verbatim — no new nutrition engine:
 *
 * - Base plan = the backend's per-slot distribution from
 *   /nutrition-profile/today (shared query). A previously saved server
 *   plan (GET /day-plan/today) hydrates over it — the SERVER row is the
 *   single source of truth; nothing is persisted locally.
 * - 3/4-meal view with the web's exact scale-up rule for 3-meal mode.
 * - Per-slot editing with the web's ±5 g macro steppers; kcal always
 *   follows 4/4/9 from macros; a slot can only be saved when its kcal and
 *   macro-kcal agree within 5, and the day may not exceed the goal.
 * - "Fördela automatiskt" uses the web's percentages; "Återgå till Nutris
 *   rekommendation" restores the backend distribution.
 * - Save = POST /day-plan (web payload, web isManuallyEdited flag), and
 *   is blocked while the plan misses the daily goal by more than 50 kcal
 *   — the same guardrail the web enforces.
 * - Heldag's ready-made package is offered as a quick suggestion (link to
 *   the existing /heldag flow — decision Alternativ B); Nutri Anpassar
 *   reads the saved plan for its slot targets, which is stated in copy.
 */

const AUTO_PCTS_3 = [0.32, 0.34, 0.34];
const AUTO_PCTS_4 = [0.25, 0.3, 0.25, 0.2];


export function PlanDayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const todayQuery = useTodayNutritionQuery();

  const baseMeals = useMemo(() => todayQuery.data?.meals ?? [], [todayQuery.data]);
  const goal = todayQuery.data?.adjustedTarget ?? null;

  const [mealTab, setMealTab] = useState<"3" | "4">("4");
  const [localMeals, setLocalMeals] = useState<ApiMealDistribution[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate ONCE from the shared saved-plan query (same cache row the menu
  // reads): server-saved plan wins over the backend baseline (web rule).
  const queryClient = useQueryClient();
  const dayPlanQuery = useTodayDayPlanQuery();
  useEffect(() => {
    if (hydrated || baseMeals.length === 0 || !dayPlanQuery.isFetched) return;
    const saved = dayPlanQuery.data;
    if (saved && saved.meals.length > 0) {
      const savedTab = saved.mealCount === 3 ? "3" : "4";
      const savedMeals: ApiMealDistribution[] = saved.meals.map((m) => ({
        label: m.label,
        calories: m.calories,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
        timingPurpose: baseMeals.find((bm) => bm.label === m.label)?.timingPurpose ?? "",
      }));
      setMealTab(savedTab);
      setLocalMeals(savedMeals);
      setSavedSnapshot(JSON.stringify({ tab: savedTab, meals: savedMeals }));
    } else {
      setLocalMeals(baseMeals);
    }
    setHydrated(true);
  }, [hydrated, baseMeals, dayPlanQuery.data, dayPlanQuery.isFetched]);

  // ── Editing modal state (web's mealEditInput, ±5 g steppers) ──
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [edit, setEdit] = useState<SlotDraft>(EMPTY_DRAFT);
  const openEdit = (idx: number) => {
    setEdit(draftFor(localMeals[idx]));
    setEditingIdx(idx);
  };

  /**
   * Leave the editor without committing anything.
   *
   * WHERE THE UNSAVED EDIT GOES. Nowhere — and that is the point. The
   * steppers only ever move `edit`, a draft that lives beside the plan;
   * "Använd" is the one thing that copies it into `localMeals`. Closing
   * simply stops rendering the draft, so nothing was written and nothing
   * needs undoing.
   *
   * The draft is deliberately NOT zeroed here. `openEdit` re-seeds it from
   * the stored slot every single time, so a stale draft can never be shown;
   * clearing it on the way out would only make the card flash "0 g" during
   * the fade-out.
   */
  const closeEditor = () => setEditingIdx(null);
  /**
   * Opened from a Home slot: land on THAT slot's editor, not on the list.
   *
   * Home sends the slot label because Lunch and Middag are two rows of the
   * same plan — arriving without it would mean the customer has to find
   * their row again, and would make "ändra middagen" and "ändra lunchen"
   * the same action.
   *
   * Applied once, after hydration, so the editor opens on the SAVED values
   * rather than on the baseline that is about to be replaced. The ref makes
   * it once per visit: reopening the modal by hand and closing it must not
   * be undone by a re-render.
   */
  const params = useLocalSearchParams<{ slot?: string }>();
  const requestedSlot = params.slot;
  const slotOpened = useRef(false);
  useEffect(() => {
    if (slotOpened.current || !hydrated || !requestedSlot) return;
    slotOpened.current = true;
    const idx = localMeals.findIndex((m) => m.label === requestedSlot);
    if (idx < 0) return;
    // Same rule the "Ändra" button uses — never open an editor the screen
    // itself would not offer.
    if (!isSlotEditable(mealTab, localMeals.length)) return;
    setEdit(draftFor(localMeals[idx]));
    setEditingIdx(idx);
  }, [hydrated, requestedSlot, localMeals, mealTab]);

  const adjustMacro = (key: "proteinG" | "carbsG" | "fatG", delta: number) => {
    setEdit((prev) => {
      const updated = { ...prev, [key]: Math.max(0, prev[key] + delta) };
      updated.calories = updated.proteinG * 4 + updated.carbsG * 4 + updated.fatG * 9;
      return updated;
    });
  };

  // ── Derived numbers (web formulas, verbatim) ──
  const localTotal = localMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      proteinG: acc.proteinG + m.proteinG,
      carbsG: acc.carbsG + m.carbsG,
      fatG: acc.fatG + m.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

  const visibleSlots: ApiMealDistribution[] = useMemo(
    () => visibleSlotsFor(mealTab, localMeals),
    [mealTab, localMeals]
  );

  const totalDiff = goal ? Math.abs(localTotal.calories - goal.calories) : 0;
  const macrosInBalance =
    goal !== null &&
    Math.abs(localTotal.proteinG - goal.proteinG) <= 5 &&
    Math.abs(localTotal.carbsG - goal.carbsG) <= 5 &&
    Math.abs(localTotal.fatG - goal.fatG) <= 5;

  const localMealsEdited =
    localMeals.length > 0 &&
    baseMeals.length > 0 &&
    localMeals.some((m, i) => {
      const o = baseMeals[i];
      return (
        !o ||
        m.calories !== o.calories ||
        m.proteinG !== o.proteinG ||
        m.carbsG !== o.carbsG ||
        m.fatG !== o.fatG
      );
    });

  const currentSnapshot = JSON.stringify({ tab: mealTab, meals: localMeals });
  const hasUnsavedChanges = savedSnapshot !== currentSnapshot;

  // ── Actions ──
  const handleAutoDistribute = () => {
    if (!goal) return;
    const pcts = mealTab === "3" ? AUTO_PCTS_3 : AUTO_PCTS_4;
    const count = pcts.length;
    setLocalMeals((prev) =>
      prev.map((m, i) => {
        if (i >= count) return m;
        const p = pcts[i];
        const proteinG = Math.round(goal.proteinG * p);
        const carbsG = Math.round(goal.carbsG * p);
        const fatG = Math.round(goal.fatG * p);
        return { ...m, proteinG, carbsG, fatG, calories: proteinG * 4 + carbsG * 4 + fatG * 9 };
      })
    );
  };
  const handleResetToRecommendation = () => setLocalMeals(baseMeals);

  type SaveStatus = "idle" | "saving" | "success" | "error";
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveDisabled =
    (!hasUnsavedChanges && saveStatus === "idle") || saveStatus === "saving" || totalDiff > 50;

  const handleSave = async () => {
    if (saveDisabled) return;
    setSaveStatus("saving");
    try {
      const meals: SavedMealSlotDto[] = localMeals.map((m) => ({
        label: m.label,
        calories: m.calories,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
      }));
      await saveTodayDayPlan({
        mealCount: parseInt(mealTab, 10),
        isManuallyEdited: localMealsEdited,
        meals,
        totalCalories: localTotal.calories,
        totalProteinG: localTotal.proteinG,
        totalCarbsG: localTotal.carbsG,
        totalFatG: localTotal.fatG,
      });
      setSavedSnapshot(currentSnapshot);
      // Refresh the shared saved-plan cache so the menu's recommendations
      // follow the new plan immediately when the user returns.
      queryClient.invalidateQueries({ queryKey: DAY_PLAN_QUERY_PREFIX }).catch(() => {});
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // ── Screen states ──
  if (todayQuery.isLoading || (!hydrated && !todayQuery.isError)) {
    return (
      <Screen>
        <Header onBack={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)/meny"))} />
        <LoadingIndicator />
      </Screen>
    );
  }

  if (todayQuery.isError || !goal) {
    const gap = todayQuery.isError && isProfileGapError(todayQuery.error);
    return (
      <Screen>
        <Header onBack={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)/meny"))} />
        <View style={styles.stateWrap}>
          <ThemedText style={styles.stateTitle}>
            {gap ? t("planDay.profileGapTitle") : t("planDay.errorTitle")}
          </ThemedText>
          <ThemedText style={styles.stateBody}>
            {gap ? t("planDay.profileGapBody") : t("planDay.errorBody")}
          </ThemedText>
          <Pressable
            onPress={() =>
              gap ? router.navigate("/(tabs)/konto") : todayQuery.refetch()
            }
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.primaryBtnText}>
              {gap ? t("menu.personal.profileGapCta") : t("menu.retry")}
            </ThemedText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const editingMeal = editingIdx !== null ? localMeals[editingIdx] : null;
  const macroCalories = edit.proteinG * 4 + edit.carbsG * 4 + edit.fatG * 9;
  const mealMacroMatch = Math.abs(edit.calories - macroCalories) <= 5;
  const otherTotal =
    editingIdx !== null
      ? localMeals.filter((_, i) => i !== editingIdx).reduce((s, m) => s + m.calories, 0)
      : 0;
  const newDayTotal = otherTotal + edit.calories;
  const dayOver = newDayTotal > goal.calories;
  const canSaveMeal = edit.calories > 0 && mealMacroMatch && !dayOver;

  return (
    <Screen>
      <Header onBack={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)/meny"))} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing[8] }]}>
        <ThemedText variant="headline" style={styles.title}>
          {t("planDay.title")}
        </ThemedText>
        <ThemedText style={styles.subtitle}>{t("planDay.subtitle")}</ThemedText>

        {/* Daily goal */}
        <View style={styles.goalCard}>
          <ThemedText style={styles.sectionLabel}>{t("planDay.goalHead").toUpperCase()}</ThemedText>
          <View style={styles.goalRow}>
            <ThemedText variant="monoLarge" style={styles.goalKcal}>
              {goal.calories}
            </ThemedText>
            <ThemedText variant="caption" style={styles.goalUnit}>
              {t("home.kcalPerDay")}
            </ThemedText>
          </View>
          <ThemedText variant="caption" style={styles.goalMacros}>
            {goal.proteinG}g {t("home.macroProtein").toLowerCase()} · {goal.carbsG}g{" "}
            {t("menu.carbsShort")} · {goal.fatG}g {t("menu.fatShort")}
          </ThemedText>
        </View>

        {/* 3/4-meal toggle + slots — the SAME component Home renders, so the
            two surfaces cannot drift apart. Only the row's trailing control
            differs: the planner edits, Home navigates. */}
        <DayPlanSlotList
          mealTab={mealTab}
          onMealTabChange={setMealTab}
          slots={visibleSlots}
          renderAction={(slot) => {
            const realIdx = localMeals.findIndex((m) => m.label === slot.label);
            if (!isSlotEditable(mealTab, localMeals.length) || realIdx < 0) return null;
            return (
              <Pressable
                onPress={() => openEdit(realIdx)}
                style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={t("planDay.editSlotAria", {
                  slot: t(`planDay.slots.${slot.label}`, { defaultValue: slot.label }),
                })}
              >
                <ThemedText style={styles.editBtnText}>{t("planDay.edit")}</ThemedText>
              </Pressable>
            );
          }}
        />

        {/* Plan vs goal summary */}
        <View style={styles.summaryCard}>
          <ThemedText style={styles.sectionLabel}>{t("planDay.summaryHead").toUpperCase()}</ThemedText>
          <SummaryRow label={t("planDay.goalRow")} value={`${goal.calories} kcal`} />
          <SummaryRow label={t("planDay.plannedRow")} value={`${localTotal.calories} kcal`} />
          <SummaryRow
            label={t("planDay.diffRow")}
            value={`${localTotal.calories - goal.calories >= 0 ? "+" : ""}${localTotal.calories - goal.calories} kcal`}
            accent={totalDiff > 50 ? colors.accent : colors.success}
          />
          <ThemedText variant="caption" style={styles.balanceText}>
            {totalDiff > 50
              ? t("planDay.offBalance")
              : macrosInBalance
                ? t("planDay.inBalance")
                : t("planDay.nearBalance")}
          </ThemedText>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={handleAutoDistribute}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.secondaryBtnText}>{t("planDay.autoDistribute")}</ThemedText>
          </Pressable>
          <Pressable
            onPress={handleResetToRecommendation}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={t("planDay.resetAria")}
          >
            <RotateCcw size={12} color={colors.textSecondary} strokeWidth={2} />
            <ThemedText style={styles.secondaryBtnText}>{t("planDay.reset")}</ThemedText>
          </Pressable>
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saveDisabled}
          style={({ pressed }) => [
            styles.primaryBtn,
            saveDisabled && styles.primaryBtnDisabled,
            pressed && !saveDisabled && { backgroundColor: colors.accentHover },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: saveDisabled }}
        >
          {saveStatus === "success" ? (
            <>
              <Check size={14} color={colors.textPrimary} strokeWidth={2.5} />
              <ThemedText style={styles.primaryBtnText}>{t("planDay.saved")}</ThemedText>
            </>
          ) : (
            <ThemedText style={styles.primaryBtnText}>
              {saveStatus === "saving"
                ? t("planDay.saving")
                : saveStatus === "error"
                  ? t("planDay.saveError")
                  : t("planDay.save")}
            </ThemedText>
          )}
        </Pressable>
        {totalDiff > 50 ? (
          <ThemedText variant="caption" style={styles.saveHint}>
            {t("planDay.saveBlockedHint")}
          </ThemedText>
        ) : (
          <ThemedText variant="caption" style={styles.saveHint}>
            {t("planDay.anpassarHint")}
          </ThemedText>
        )}

        {/* Heldag quick suggestion (Alternativ B) */}
        <Pressable
          onPress={() => router.push("/heldag")}
          style={({ pressed }) => [styles.heldagCard, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={t("planDay.heldagHeading")}
        >
          <View style={styles.heldagIcon}>
            <Package size={16} color={colors.accent} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.heldagHeading}>{t("planDay.heldagHeading")}</ThemedText>
            <ThemedText variant="caption" style={styles.heldagBody}>
              {t("planDay.heldagBody")}
            </ThemedText>
          </View>
        </Pressable>
      </ScrollView>

      {/* ── Slot edit modal (web's ±5 g steppers + guardrails) ── */}
      <Modal
        visible={editingIdx !== null && editingMeal !== null}
        transparent
        animationType="fade"
        onRequestClose={closeEditor}
      >
        <View style={styles.modalBackdrop}>
          {/* TAP OUTSIDE TO LEAVE. The backdrop used to be a plain View, so
              the only ways out were the Avbryt button and the Android back
              key — from Home's "Ändra" it read as a popup you could not put
              down. This is the app's existing centred-modal pattern (see
              NutritionRingsCard): a full-bleed Pressable BEHIND the card.
              The card is a sibling rendered after it, so it sits on top and
              keeps its own taps — Använd and Avbryt cannot be triggered
              through it, and it cannot be triggered through them.
              It closes the editor and nothing else: no save, no navigation
              away from the planner. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeEditor}
            // Defensive: a plan being written must not be interrupted. The
            // screen's Save sits behind this modal and cannot be reached
            // while it is open, so this should never engage — but "never"
            // is cheaper to guarantee than to argue.
            disabled={saveStatus === "saving"}
            accessibilityRole="button"
            accessibilityLabel={t("planDay.cancel")}
          />
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>
              {editingMeal
                ? t(`planDay.slots.${editingMeal.label}`, { defaultValue: editingMeal.label })
                : ""}
            </ThemedText>

            {(
              [
                { key: "proteinG" as const, label: t("home.macroProtein") },
                { key: "carbsG" as const, label: t("planDay.carbs") },
                { key: "fatG" as const, label: t("planDay.fat") },
              ]
            ).map((field) => (
              <View key={field.key} style={styles.stepperRow}>
                <ThemedText style={styles.stepperLabel}>{field.label}</ThemedText>
                <View style={styles.stepperControls}>
                  <Pressable
                    onPress={() => adjustMacro(field.key, -5)}
                    disabled={edit[field.key] <= 0}
                    style={[styles.stepBtn, edit[field.key] <= 0 && styles.stepBtnDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={t("planDay.decreaseAria", { macro: field.label })}
                  >
                    <ThemedText style={styles.stepBtnText}>−</ThemedText>
                  </Pressable>
                  <ThemedText style={styles.stepValue}>{edit[field.key]} g</ThemedText>
                  <Pressable
                    onPress={() => adjustMacro(field.key, 5)}
                    style={styles.stepBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t("planDay.increaseAria", { macro: field.label })}
                  >
                    <ThemedText style={styles.stepBtnText}>+</ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}

            <View style={styles.modalSummary}>
              <SummaryRow label={t("planDay.mealKcal")} value={`${edit.calories} kcal`} />
              <SummaryRow label={t("planDay.newDayTotal")} value={`${newDayTotal} kcal`} />
              <SummaryRow
                label={t("planDay.remainingRow")}
                value={`${goal.calories - newDayTotal} kcal`}
                accent={dayOver ? colors.accent : undefined}
              />
            </View>
            {dayOver ? (
              <ThemedText variant="caption" style={[styles.saveHint, { color: colors.accent }]}>
                {t("planDay.dayOver")}
              </ThemedText>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  if (!canSaveMeal || editingIdx === null) return;
                  const rounded = Math.round(edit.calories / 10) * 10;
                  setLocalMeals((prev) =>
                    prev.map((m, i) =>
                      i === editingIdx
                        ? {
                            ...m,
                            calories: rounded,
                            proteinG: edit.proteinG,
                            carbsG: edit.carbsG,
                            fatG: edit.fatG,
                          }
                        : m
                    )
                  );
                  closeEditor();
                }}
                disabled={!canSaveMeal}
                style={[styles.primaryBtn, styles.modalPrimary, !canSaveMeal && styles.primaryBtnDisabled]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSaveMeal }}
              >
                <ThemedText style={styles.primaryBtnText}>{t("planDay.applySlot")}</ThemedText>
              </Pressable>
              <Pressable
                onPress={closeEditor}
                style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.secondaryBtnText}>{t("planDay.cancel")}</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.headerBtn}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
      >
        <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
      </Pressable>
      <ThemedText style={styles.wordmark}>NUTRI</ThemedText>
      <View style={{ width: 36 }} />
    </View>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.summaryRow}>
      <ThemedText variant="caption" style={styles.summaryLabel}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.summaryValue, accent ? { color: accent } : null]}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
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
  content: {
    paddingHorizontal: spacing[5],
    gap: spacing[3],
  },
  title: {
    fontSize: 22,
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: -spacing[2],
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  goalCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing[4],
    gap: spacing[1],
  },
  goalRow: { flexDirection: "row", alignItems: "baseline", gap: spacing[2] },
  goalKcal: { fontSize: 30, color: colors.textPrimary },
  goalUnit: { color: colors.textSecondary },
  goalMacros: { color: colors.textTertiary },
  tabRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  tabText: { fontSize: 12.5, fontFamily: fontFamily.bodyMedium, color: colors.textTertiary },
  tabTextActive: { fontFamily: fontFamily.bodySemibold, color: colors.accent },
  slotList: { gap: spacing[2] },
  slotCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  slotDot: { width: 8, height: 8, borderRadius: radius.pill },
  slotBody: { flex: 1, minWidth: 0, gap: 2 },
  slotLabel: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  slotMacros: { color: colors.textTertiary, fontSize: 11.5 },
  editBtn: {
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  editBtnText: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  summaryCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing[4],
    gap: spacing[2],
  },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { color: colors.textSecondary },
  summaryValue: { fontSize: 13.5, fontFamily: fontFamily.monoMedium, color: colors.textPrimary },
  balanceText: { color: colors.textTertiary, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: spacing[2] },
  secondaryBtn: {
    flex: 1,
    height: 40,
    flexDirection: "row",
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: spacing[2],
  },
  secondaryBtnText: {
    fontSize: 12,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textSecondary,
    textAlign: "center",
  },
  primaryBtn: {
    height: 44,
    flexDirection: "row",
    borderRadius: radius.btn,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryBtnDisabled: { backgroundColor: "rgba(255,255,255,0.08)" },
  primaryBtnText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  saveHint: { color: colors.textTertiary, textAlign: "center" },
  heldagCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing[4],
  },
  heldagIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.btn,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heldagHeading: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  heldagBody: { color: colors.textTertiary, marginTop: 2 },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
    gap: spacing[3],
  },
  stateTitle: { fontSize: 17, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  stateBody: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing[5],
    gap: spacing[3],
  },
  modalTitle: { fontSize: 16, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  stepperLabel: { fontSize: 13, color: colors.textSecondary },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.btn,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: { backgroundColor: "rgba(255,255,255,0.08)" },
  stepBtnText: { fontSize: 18, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  stepValue: {
    width: 52,
    textAlign: "center",
    fontSize: 13.5,
    fontFamily: fontFamily.monoMedium,
    color: colors.textPrimary,
  },
  modalSummary: {
    borderRadius: radius.btn,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing[3],
    gap: spacing[1],
  },
  modalActions: { gap: spacing[2] },
  modalPrimary: { marginTop: spacing[1] },
});
