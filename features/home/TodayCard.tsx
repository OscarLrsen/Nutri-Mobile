import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Droplets, Minus, Plus, ShoppingBag, Target } from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import {
  isProfileGapError,
  useRemainingTodayQuery,
  useTodayDayPlanQuery,
  useTodayNutritionQuery,
} from "@/services/api/nutritionQueries";
import {
  deriveActiveDailyNutrition,
  plannedDeviatesFromTarget,
} from "@/features/nutrition/activeDailyNutrition";
import { useActiveOrder } from "@/features/order/useActiveOrder";
import { HomeDayPlan } from "@/features/home/HomeDayPlan";
import { COMPACT_RING_SIZE, NutritionRingsCard } from "@/features/home/NutritionRingsCard";
import { GLASS_ML, useWaterLog } from "@/features/home/waterLog";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { homeAccents } from "./homeAccents";

/**
 * "Idag" — the ONE daily section (release merge of the old "Dagens plan" and
 * "Dagens status" cards, which competed with duplicate headings and repeated
 * numbers).
 *
 * Reading order mirrors how the day is experienced: the goal (kcal + macros)
 * → what has happened so far (ordered / remaining, same backend semantics as
 * before: consumedToday counts today's accepted ORDERS) → water → the day's
 * single next action. The plan/goal deviation row and the profile-gap CTA
 * are carried over unchanged.
 *
 * Water is device-local by design — the backend has no water model, so a
 * glass is a fast, offline-safe counter (see waterLog.ts) rather than fake
 * API data. Rapid taps all land; the UI answers instantly.
 */
export function TodayCard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const todayQuery = useTodayNutritionQuery();
  const dayPlanQuery = useTodayDayPlanQuery();
  const remainingQuery = useRemainingTodayQuery();
  const { isActive: hasActiveOrder } = useActiveOrder();
  const water = useWaterLog(user?.id ?? null);

  if (todayQuery.isLoading) {
    return (
      <Card style={styles.card} accessibilityLabel={t("home.todayHead")}>
        <SectionLabel />
        <Skeleton height={40} width={140} />
        <Skeleton height={16} />
      </Card>
    );
  }

  if (todayQuery.isError && isProfileGapError(todayQuery.error)) {
    return (
      <Card style={styles.card}>
        <ThemedText variant="bodyMedium" style={styles.missingTitle}>
          {t("home.missingProfileTitle")}
        </ThemedText>
        <ThemedText variant="caption" style={styles.missingBody}>
          {t("home.missingProfileBody")}
        </ThemedText>
        <Pressable
          onPress={() => router.navigate("/(tabs)/konto")}
          style={({ pressed }) => [styles.missingCta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={t("home.missingProfileCta")}
        >
          <ThemedText variant="bodyMedium" style={styles.missingCtaText}>
            {t("home.missingProfileCta")}
          </ThemedText>
        </Pressable>
      </Card>
    );
  }

  if (todayQuery.isError || !todayQuery.data) {
    return (
      <Card style={styles.card}>
        <SectionLabel />
        <ThemedText variant="caption" style={styles.errorText}>
          {t("home.planError")}
        </ThemedText>
        <Pressable
          onPress={() => todayQuery.refetch()}
          style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t("menu.retry")}
        >
          <ThemedText variant="caption" style={styles.retryText}>
            {t("menu.retry")}
          </ThemedText>
        </Pressable>
      </Card>
    );
  }

  const today = todayQuery.data;
  const active = deriveActiveDailyNutrition(today, dayPlanQuery.data);
  const target = active?.target ?? today.adjustedTarget;
  const dayTypeName = today.dayType
    ? t(`profile.dayTypeNames.${today.dayType}`, { defaultValue: today.dayType })
    : null;
  const showPlanned = active !== null && plannedDeviatesFromTarget(active);
  const plannedDiff =
    showPlanned && active.planned ? target.calories - active.planned.calories : 0;

  const remaining = remainingQuery.data ?? null;
  const nothingOrdered = (remaining?.consumedToday.calories ?? 0) === 0;

  return (
    <Card style={styles.card} accessibilityLabel={t("home.todayHead")}>
      {/* ── The progress rings, in the card's top-right corner ──────
          Absolutely placed rather than laid out in a row, so putting them
          in the corner moves NOTHING else in TODAY — the heading, the
          number, the macros, the day plan and the tally all stay exactly
          where they were. The two rows that reach up here reserve
          `ringReserve` on their right, so no text can ever pass underneath
          it; it therefore needs no zIndex and overlaps nothing. Its touch
          area is the ring itself and nothing more.
          Fed the SAME `target` and `consumedToday` printed below, so the
          rings cannot disagree with the text, and it fetches nothing. */}
      <View style={styles.ringCorner} pointerEvents="box-none">
        <NutritionRingsCard target={target} consumed={remaining?.consumedToday ?? null} />
      </View>

      {/* ── The goal ─────────────────────────────────────────────── */}
      <View style={[styles.headRow, styles.ringReserve]}>
        <SectionLabel />
        {dayTypeName ? (
          <View style={styles.dayTypeChip}>
            <ThemedText style={styles.dayTypeText}>{dayTypeName.toUpperCase()}</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={[styles.kcalRow, styles.ringReserve]}>
        <ThemedText variant="monoLarge" style={styles.kcalValue}>
          {target.calories}
        </ThemedText>
        <ThemedText variant="caption" style={styles.kcalLabel}>
          {t("home.kcalPerDay")}
        </ThemedText>
      </View>

      <View style={styles.macroRow}>
        <Macro label={t("home.macroProtein")} grams={target.proteinG} accent={homeAccents.protein} />
        <Macro label={t("home.macroCarbs")} grams={target.carbsG} accent={homeAccents.carbs} />
        <Macro label={t("home.macroFat")} grams={target.fatG} accent={homeAccents.fat} />
      </View>

      {showPlanned && active?.planned ? (
        <View style={styles.plannedRow}>
          <ThemedText variant="caption" style={styles.plannedLabel}>
            {t("home.plannedToday", { kcal: active.planned.calories })}
          </ThemedText>
          <ThemedText variant="caption" style={styles.plannedDiff}>
            {plannedDiff > 0
              ? t("home.plannedRemaining", { kcal: plannedDiff })
              : t("home.plannedOver", { kcal: Math.abs(plannedDiff) })}
          </ThemedText>
        </View>
      ) : null}

      {!today.dayType ? (
        <ThemedText variant="caption" style={styles.noSchedule}>
          {t("home.noSchedule")}
        </ThemedText>
      ) : null}

      {/* ── The day's plan ────────────────────────────────────────────
          Moved here from the menu's "Planera din dag" card. Sits after the
          macros and before what has been ordered, because it belongs to the
          goal above it, not to the tally below. */}
      <View style={styles.dayPlanBlock}>
        <HomeDayPlan />
      </View>

      {/* ── So far today (old "Dagens status", compacted) ─────────── */}
      {remaining ? (
        <View style={styles.statusRow}>
          <View style={styles.statusCell}>
            <View style={styles.statusHead}>
              <ShoppingBag size={12} color={homeAccents.protein.value} strokeWidth={2.25} />
              <ThemedText variant="caption" style={styles.statusLabel}>
                {t("home.orderedToday")}
              </ThemedText>
            </View>
            <ThemedText variant="mono" style={styles.statusValue}>
              {remaining.consumedToday.calories} {t("home.kcalUnit")}
            </ThemedText>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusCell}>
            <View style={styles.statusHead}>
              <Target size={12} color={homeAccents.carbs.value} strokeWidth={2.25} />
              <ThemedText variant="caption" style={styles.statusLabel}>
                {t("home.remainingToday")}
              </ThemedText>
            </View>
            <ThemedText variant="mono" style={styles.statusValue}>
              {remaining.remainingToday.calories} {t("home.kcalUnit")}
            </ThemedText>
          </View>
        </View>
      ) : null}

      {/* ── Water ─────────────────────────────────────────────────── */}
      <View style={styles.waterRow}>
        <View style={styles.waterInfo}>
          <Droplets size={16} color="#5FA0FF" strokeWidth={2.25} />
          <View>
            <ThemedText variant="bodyMedium" style={styles.waterLabel}>
              {t("water.label")}
            </ThemedText>
            <ThemedText variant="caption" style={styles.waterMeta}>
              {t("water.count", { glasses: water.glasses, ml: water.ml, glassMl: GLASS_ML })}
            </ThemedText>
          </View>
        </View>
        <View style={styles.waterButtons}>
          {water.glasses > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("water.remove")}
              onPress={water.removeGlass}
              style={({ pressed }) => [styles.waterBtn, styles.waterBtnGhost, pressed && { opacity: 0.7 }]}
            >
              <Minus size={16} color={colors.textSecondary} strokeWidth={2.25} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("water.add")}
            onPress={water.addGlass}
            style={({ pressed }) => [styles.waterBtn, pressed && { opacity: 0.8 }]}
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      {/* ── The day's next action ─────────────────────────────────── */}
      {!hasActiveOrder && nothingOrdered ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("home.nextActionOrder")}
          onPress={() => router.navigate("/(tabs)/meny")}
          style={({ pressed }) => [styles.nextAction, pressed && { opacity: 0.85 }]}
        >
          <ThemedText variant="bodyMedium" style={styles.nextActionText}>
            {t("home.nextActionOrder")}
          </ThemedText>
        </Pressable>
      ) : null}
    </Card>
  );
}

function SectionLabel() {
  const { t } = useTranslation();
  return <ThemedText style={styles.sectionLabel}>{t("home.todayHead").toUpperCase()}</ThemedText>;
}

function Macro({
  label,
  grams,
  accent,
}: {
  label: string;
  grams: number;
  accent: { value: string; soft: string; border: string };
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.macro, { backgroundColor: accent.soft, borderColor: accent.border }]}>
      <View style={[styles.macroEdge, { backgroundColor: accent.value }]} />
      <ThemedText variant="monoLarge" style={[styles.macroValue, { color: accent.value }]}>
        {grams}
        <ThemedText variant="caption" style={styles.macroUnit}>
          {t("home.gramUnit")}
        </ThemedText>
      </ThemedText>
      <ThemedText variant="caption" style={styles.macroLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Card's own padding — the ring is inset by exactly this to sit in the
 *  corner of the content box rather than on the border. */
const CARD_PADDING = spacing[4];
const RING_SIZE = COMPACT_RING_SIZE;

const styles = StyleSheet.create({
  card: {
    gap: spacing[3],
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  dayTypeChip: {
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  dayTypeText: {
    fontSize: 10,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1,
    color: colors.accent,
  },
  // The corner itself. `top`/`right` equal the Card's own padding, so the
  // ring sits flush inside the card's content box.
  ringCorner: {
    position: "absolute",
    top: CARD_PADDING,
    right: CARD_PADDING,
  },
  // What the rows that reach up beside the ring must keep clear. Reserving
  // the space is what makes the absolute placement safe: text cannot end up
  // underneath something it is laid out around.
  ringReserve: {
    paddingRight: RING_SIZE + spacing[3],
  },
  kcalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing[2],
  },
  kcalValue: {
    fontSize: 34,
    color: colors.textPrimary,
  },
  kcalLabel: {
    color: colors.textSecondary,
  },
  macroRow: {
    flexDirection: "row",
    gap: spacing[3],
  },
  macro: {
    flex: 1,
    gap: 2,
    borderRadius: radius.card,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    overflow: "hidden",
  },
  macroEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    opacity: 0.85,
  },
  macroValue: {
    fontSize: 18,
  },
  macroUnit: {
    color: colors.textTertiary,
  },
  macroLabel: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  noSchedule: {
    color: colors.textTertiary,
  },
  plannedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
    borderRadius: radius.btn,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  plannedLabel: {
    color: colors.textSecondary,
  },
  plannedDiff: {
    color: colors.textTertiary,
  },
  dayPlanBlock: {
    gap: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: spacing[3],
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: spacing[3],
  },
  statusCell: {
    flex: 1,
    gap: 2,
  },
  statusHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  statusLabel: {
    color: colors.textSecondary,
  },
  statusValue: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  statusDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing[3],
  },
  waterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: spacing[3],
  },
  waterInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    flex: 1,
  },
  waterLabel: {
    fontSize: 14,
  },
  waterMeta: {
    color: colors.textTertiary,
  },
  waterButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  waterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  waterBtnGhost: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nextAction: {
    borderRadius: radius.btn,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    paddingVertical: spacing[3],
  },
  nextActionText: {
    color: colors.accent,
    fontSize: 14,
  },
  missingTitle: {
    color: colors.textPrimary,
  },
  missingBody: {
    color: colors.textSecondary,
    lineHeight: 18,
  },
  missingCta: {
    marginTop: spacing[1],
    alignSelf: "flex-start",
    borderRadius: radius.btn,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  missingCtaText: {
    color: colors.textPrimary,
  },
  errorText: {
    color: colors.textSecondary,
  },
  retry: {
    alignSelf: "flex-start",
    paddingVertical: spacing[1],
  },
  retryText: {
    color: colors.accent,
  },
});
