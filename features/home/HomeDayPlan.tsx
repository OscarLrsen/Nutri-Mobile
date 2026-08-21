import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { CalendarRange } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { DayPlanSlotList } from "@/features/dayplan/DayPlanSlotList";
import { savedPlanTargets, visibleSlotsFor } from "@/features/dayplan/dayPlanSlots";
import { menuHrefForSlot, PLAN_DAY_ROUTE } from "@/features/dayplan/dayPlanNavigation";
import { parseSlot } from "@/features/menu/mealRecommendation";
import { useTodayDayPlanQuery, useTodayNutritionQuery } from "@/services/api/nutritionQueries";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * The day plan, on Home.
 *
 * It used to live behind a "Planera din dag" card at the top of the menu's
 * Huvudmåltider tab — one tap away from the thing it describes, and in the
 * wrong place: the plan is about the DAY, and the day is Home. The card is
 * gone from the menu and the controls render here instead, between the
 * macros and what has been ordered so far, which is the order the day is
 * actually experienced in.
 *
 * SAME COMPONENT, not a copy: the toggle and the rows come from
 * DayPlanSlotList, which the full planner also renders.
 *
 * NO EXTRA NETWORK. Both queries below are the same shared cache rows
 * TodayCard already mounts, so this component adds no request of its own.
 *
 * READ-ONLY BY DESIGN. Switching 3/4 here changes what Home shows; it does
 * not write a plan. Saving stays in the planner, where there is a save
 * button, a goal comparison and the guardrails that go with them — a
 * silent write from a Home tap would be a surprise.
 */
export function HomeDayPlan() {
  const { t } = useTranslation();
  const router = useRouter();
  const todayQuery = useTodayNutritionQuery();
  const dayPlanQuery = useTodayDayPlanQuery();

  const baseMeals = useMemo(() => todayQuery.data?.meals ?? [], [todayQuery.data]);
  const saved = dayPlanQuery.data;

  /**
   * The numbers on these rows are the SAVED PLAN's, derived exactly the way
   * the menu derives the targets it recommends against — one function,
   * `savedPlanTargets`, reading the plan's own meal count.
   *
   * Home no longer keeps a 3/4 toggle of its own. It only ever changed what
   * Home displayed (it wrote nothing), so switching it moved these numbers
   * away from the plan while the menu kept recommending against the stored
   * one — the same slot showing two different sets of numbers. The meal
   * count is changed in the planner, where it is saved and where every
   * reader picks it up.
   */
  const mealTab: "3" | "4" = saved?.mealCount === 3 ? "3" : "4";

  const visibleSlots = useMemo(() => {
    const fromPlan = savedPlanTargets(saved);
    if (fromPlan.length > 0) {
      // Carry the timing copy across from the backend baseline; the saved
      // plan does not store it.
      return fromPlan.map((m) => ({
        ...m,
        timingPurpose: baseMeals.find((bm) => bm.label === m.label)?.timingPurpose ?? "",
      }));
    }
    // No saved plan yet — the backend's automatic distribution, shown as-is.
    return visibleSlotsFor("4", baseMeals);
  }, [saved, baseMeals]);

  /** The one navigation the row and its Beställ button share. */
  const openMenuForSlot = useCallback(
    (label: string) => {
      const wizardSlot = parseSlot(label);
      if (!wizardSlot) return;
      router.navigate(menuHrefForSlot(wizardSlot, Date.now()));
    },
    [router]
  );

  if (visibleSlots.length === 0) return null;

  return (
    <View style={{ gap: spacing[2] }}>
      <DayPlanSlotList
        mealTab={mealTab}
        slots={visibleSlots}
        slotAccessibilityHint={t("home.dayPlanSlotHint")}
        onSlotPress={(slot) => openMenuForSlot(slot.label)}
        // ORDER, NOT EDIT. These four buttons used to open the planner on
        // their own slot — four separate doors to the same screen. Editing
        // the plan is now one shared entry below the list; what a row offers
        // is the thing you actually came to Home to do, which is order the
        // meal it describes.
        //
        // Same destination as the row press, through the same helper, so the
        // two can never drift apart.
        renderAction={(slot) => {
          const wizardSlot = parseSlot(slot.label);
          if (!wizardSlot) return null;
          const label = t(`planDay.slots.${slot.label}`, { defaultValue: slot.label });
          return (
            <Pressable
              onPress={() => openMenuForSlot(slot.label)}
              style={({ pressed }) => [styles.orderBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`${t("planDay.order")} — ${label}`}
            >
              <ThemedText style={styles.orderBtnText}>{t("planDay.order")}</ThemedText>
            </Pressable>
          );
        }}
      />

      {/* ONE way into the planner, for the whole day. The four per-slot
          buttons that used to lead here are gone: the planner shows all four
          slots anyway, so four doors into the same room was three too many —
          and it left the rows with no way to do the obvious thing. */}
      <Pressable
        onPress={() => router.push(PLAN_DAY_ROUTE)}
        style={({ pressed }) => [styles.planCta, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityLabel={t("planDay.title")}
      >
        <CalendarRange size={14} color={colors.accent} strokeWidth={2} />
        <ThemedText style={styles.planCtaText}>{t("planDay.title")}</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same shape the planner's row control has always had — this replaces
  // "Ändra" in place rather than introducing a new visual language.
  orderBtn: {
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  orderBtnText: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  planCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    marginTop: spacing[1],
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: spacing[3],
  },
  planCtaText: { fontSize: 13, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
});
