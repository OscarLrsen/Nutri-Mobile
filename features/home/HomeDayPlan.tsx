import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";

import { DayPlanSlotList } from "@/features/dayplan/DayPlanSlotList";
import { visibleSlotsFor } from "@/features/dayplan/dayPlanSlots";
import { categoryForSlot, parseSlot } from "@/features/menu/mealRecommendation";
import { useTodayDayPlanQuery, useTodayNutritionQuery } from "@/services/api/nutritionQueries";
import { useTranslation } from "@/i18n";
import { colors, spacing } from "@/theme";

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

  // The saved server plan wins over the backend baseline — the planner's
  // rule, so Home and the planner never disagree about today.
  const meals = useMemo(() => {
    if (saved && saved.meals.length > 0) {
      return saved.meals.map((m) => ({
        label: m.label,
        calories: m.calories,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
        timingPurpose: baseMeals.find((bm) => bm.label === m.label)?.timingPurpose ?? "",
      }));
    }
    return baseMeals;
  }, [saved, baseMeals]);

  // Hydrated from the saved plan once it arrives, then owned by the user's
  // taps. `hydrated` (rather than comparing values) is what keeps a later
  // refetch from yanking the toggle back under a finger.
  const [mealTab, setMealTab] = useState<"3" | "4">("4");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated || !dayPlanQuery.isFetched) return;
    if (saved && saved.meals.length > 0) setMealTab(saved.mealCount === 3 ? "3" : "4");
    setHydrated(true);
  }, [hydrated, dayPlanQuery.isFetched, saved]);

  const visibleSlots = useMemo(() => visibleSlotsFor(mealTab, meals), [mealTab, meals]);

  if (visibleSlots.length === 0) return null;

  return (
    <View style={{ gap: spacing[2] }}>
      <DayPlanSlotList
        mealTab={mealTab}
        onMealTabChange={setMealTab}
        slots={visibleSlots}
        slotAccessibilityHint={t("home.dayPlanSlotHint")}
        onSlotPress={(slot) => {
          // Straight into the menu with that category selected — no
          // intermediate screen. The SLOT rides along because Lunch and
          // Middag share the Huvudmåltider chip, and it is the slot (not the
          // chip) that decides the recommended portion.
          const wizardSlot = parseSlot(slot.label);
          if (!wizardSlot) return;
          router.navigate({
            pathname: "/(tabs)/meny",
            params: { category: categoryForSlot(wizardSlot), slot: wizardSlot },
          });
        }}
        renderAction={() => (
          <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
        )}
      />
    </View>
  );
}
