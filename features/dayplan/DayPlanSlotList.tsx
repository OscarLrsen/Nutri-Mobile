import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiMealDistribution } from "@/services/api/nutrition";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { slotColor } from "./dayPlanSlots";

/**
 * The 3/4-meal toggle and the Frukost / Mellanmål / Lunch / Middag rows.
 *
 * Lifted out of PlanDayScreen UNCHANGED — same tab pills, same slot cards,
 * same colours, same copy — because it now renders in two places: the
 * planner, where a row opens the macro editor, and Home, where a row opens
 * that category in the menu. Extracting it was the point: a second hand-made
 * copy on Home would have drifted the first time either one was touched.
 *
 * The two callers differ only in what a row DOES:
 * - `renderAction` puts a trailing control on the row (the planner's "Ändra").
 * - `onSlotPress` makes the whole row a button (Home's navigation).
 * Passing neither renders a plain, inert list.
 */
export function DayPlanSlotList({
  mealTab,
  onMealTabChange,
  slots,
  onSlotPress,
  renderAction,
  slotAccessibilityHint,
}: {
  mealTab: "3" | "4";
  /**
   * Omitted = the count is not changeable here, and the pills are not shown.
   *
   * Home does that deliberately. The toggle only ever changed what Home
   * DISPLAYED — it wrote nothing — so switching it moved Home's numbers away
   * from the saved plan while the menu, which reads that plan, kept
   * recommending against the stored one. A control that silently creates two
   * sets of numbers for the same slot is worse than no control; the meal
   * count is changed in the planner, where it is saved.
   */
  onMealTabChange?: (tab: "3" | "4") => void;
  slots: ApiMealDistribution[];
  onSlotPress?: (slot: ApiMealDistribution) => void;
  renderAction?: (slot: ApiMealDistribution) => ReactNode;
  /** Spoken after the row's label when the row navigates. */
  slotAccessibilityHint?: string;
}) {
  const { t } = useTranslation();

  return (
    <>
      {onMealTabChange ? (
        <View style={styles.tabRow}>
          {(["3", "4"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => onMealTabChange(tab)}
              style={[styles.tab, mealTab === tab && styles.tabActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: mealTab === tab }}
              accessibilityLabel={t("planDay.mealCount", { count: Number(tab) })}
            >
              <ThemedText style={[styles.tabText, mealTab === tab && styles.tabTextActive]}>
                {t("planDay.mealCount", { count: Number(tab) })}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.slotList}>
        {slots.map((slot, i) => {
          const label = t(`planDay.slots.${slot.label}`, { defaultValue: slot.label });
          const body = (
            <>
              <View style={[styles.slotDot, { backgroundColor: slotColor(slot.label, i) }]} />
              <View style={styles.slotBody}>
                <ThemedText style={styles.slotLabel}>{label}</ThemedText>
                <ThemedText variant="caption" style={styles.slotMacros}>
                  {slot.calories} kcal · {slot.proteinG}g {t("home.macroProtein").toLowerCase()} ·{" "}
                  {slot.carbsG}g {t("menu.carbsShort")} · {slot.fatG}g {t("menu.fatShort")}
                </ThemedText>
              </View>
            </>
          );

          if (!onSlotPress) {
            return (
              <View key={slot.label} style={styles.slotCard}>
                {body}
                {renderAction?.(slot) ?? null}
              </View>
            );
          }

          // A ROW THAT NAVIGATES **AND** CARRIES ITS OWN BUTTON.
          //
          // The press area is the dot and the text, not the whole card, and
          // the action sits beside it rather than inside it. Nesting the
          // button in the row's Pressable would have made it one target for
          // a screen reader — the row's label would be spoken and the
          // button would be unreachable — and would have left the two
          // competing for the same touch. Same card, same spacing, same
          // order on screen; the difference is only in who owns the tap.
          return (
            <View key={slot.label} style={styles.slotCard}>
              <Pressable
                onPress={() => onSlotPress(slot)}
                style={({ pressed }) => [styles.slotMain, pressed && styles.slotCardPressed]}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint={slotAccessibilityHint}
              >
                {body}
              </Pressable>
              {renderAction?.(slot) ?? null}
            </View>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
  // The navigating half of a row. Lays out exactly as the card's own
  // children did, so the visual result is unchanged.
  slotMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  slotCardPressed: { opacity: 0.82 },
  slotDot: { width: 8, height: 8, borderRadius: radius.pill },
  slotBody: { flex: 1, minWidth: 0, gap: 2 },
  slotLabel: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  slotMacros: { color: colors.textTertiary, fontSize: 11.5 },
});
