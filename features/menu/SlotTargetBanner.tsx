import { StyleSheet, View } from "react-native";
import { Target } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiMealDistribution } from "@/services/api/nutrition";
import type { WizardSlot } from "@/features/anpassar/optimizer";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * The slot's TARGET, shown in the menu when it was opened from a day-plan row.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────
 *
 * The menu already knew the target — it is what picks M or L — but it never
 * SHOWED it. So the customer read "Lunch 750 kcal" on Home, opened the menu,
 * saw a Chicken Bowl at 565 kcal, and reasonably concluded the two screens
 * disagreed. They never did about the target; the target simply was not on
 * screen to compare against.
 *
 * ── TWO NUMBERS, SAID OUT LOUD ───────────────────────────────────────
 *
 * This banner is the TARGET: what the plan says this slot should be.
 * A meal card is that MEAL's own nutrition at the selected size — the
 * numbers the cart will carry. They are different quantities and both are
 * true, so the note underneath says which is which rather than leaving the
 * customer to guess. Nothing here rounds, scales or recomputes: it renders
 * the exact object `slotTarget` returns, which is the exact object Home
 * renders from.
 */
export function SlotTargetBanner({
  slot,
  target,
}: {
  slot: WizardSlot;
  /** Null while loading, or when there is no profile to plan from. */
  target: ApiMealDistribution | null;
}) {
  const { t } = useTranslation();

  // No target means no honest number to show — say nothing rather than a 0.
  if (!target || target.calories <= 0) return null;

  const slotName = t(`planDay.slots.${slot}`, { defaultValue: slot });

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Target size={13} color={colors.accent} strokeWidth={2.25} />
        <ThemedText style={styles.headText}>
          {slotName} · {t("menu.slotTarget.label")}
        </ThemedText>
      </View>
      <ThemedText style={styles.values}>
        {target.calories} kcal · {target.proteinG}g {t("home.macroProtein").toLowerCase()} ·{" "}
        {target.carbsG}g {t("menu.carbsShort")} · {target.fatG}g {t("menu.fatShort")}
      </ThemedText>
      <ThemedText style={styles.note}>{t("menu.slotTarget.mealNote")}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  headText: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 0.8,
    color: colors.accent,
    textTransform: "uppercase",
  },
  values: { fontSize: 13, fontFamily: fontFamily.bodyMedium, color: colors.textPrimary },
  note: { fontSize: 11.5, lineHeight: 15, color: colors.textTertiary },
});
