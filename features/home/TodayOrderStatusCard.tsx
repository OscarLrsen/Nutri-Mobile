import { StyleSheet, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { isProfileGapError, useRemainingTodayQuery } from "@/services/api/nutritionQueries";
import { homeCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * "Dagens status" — /api/nutrition-profile/remaining-today.
 *
 * SEMANTICS GUARD: the backend's consumedToday sums today's ACCEPTED ORDERS
 * (order lines on Stockholm-today with kitchen-accepted status) — nothing
 * here is registered or eaten, so the card says "Beställt idag" and carries
 * an explicit caption. No mutation, no registration CTA in this patch.
 *
 * Renders nothing on profile-gap errors (DailyTargetsCard owns that CTA)
 * and stays silent on other errors — this is secondary information and must
 * not add a second error banner under the plan card.
 */
export function TodayOrderStatusCard() {
  const remainingQuery = useRemainingTodayQuery();

  if (remainingQuery.isLoading) {
    return (
      <Card style={styles.card} accessibilityLabel={homeCopy.statusHead}>
        <ThemedText style={styles.sectionLabel}>{homeCopy.statusHead.toUpperCase()}</ThemedText>
        <Skeleton height={44} />
      </Card>
    );
  }

  if (remainingQuery.isError || !remainingQuery.data) {
    if (remainingQuery.isError && isProfileGapError(remainingQuery.error)) return null;
    return null;
  }

  const { consumedToday, remainingToday } = remainingQuery.data;

  return (
    <Card style={styles.card} accessibilityLabel={homeCopy.statusHead}>
      <ThemedText style={styles.sectionLabel}>{homeCopy.statusHead.toUpperCase()}</ThemedText>

      <View style={styles.columns}>
        <View style={styles.column}>
          <ThemedText variant="caption" style={styles.columnLabel}>
            {homeCopy.orderedToday}
          </ThemedText>
          <ThemedText variant="monoLarge" style={styles.columnValue}>
            {consumedToday.calories}
            <ThemedText variant="caption" style={styles.columnUnit}>
              {" "}
              {homeCopy.kcalUnit}
            </ThemedText>
          </ThemedText>
          <ThemedText variant="caption" style={styles.columnSub}>
            {consumedToday.proteinG}
            {homeCopy.gramUnit} {homeCopy.macroProtein.toLowerCase()}
          </ThemedText>
        </View>

        <View style={styles.divider} />

        <View style={styles.column}>
          <ThemedText variant="caption" style={styles.columnLabel}>
            {homeCopy.remainingToday}
          </ThemedText>
          <ThemedText variant="monoLarge" style={styles.columnValue}>
            {remainingToday.calories}
            <ThemedText variant="caption" style={styles.columnUnit}>
              {" "}
              {homeCopy.kcalUnit}
            </ThemedText>
          </ThemedText>
          <ThemedText variant="caption" style={styles.columnSub}>
            {remainingToday.proteinG}
            {homeCopy.gramUnit} {homeCopy.macroProtein.toLowerCase()}
          </ThemedText>
        </View>
      </View>

      <View style={styles.noteBox}>
        <ThemedText variant="caption" style={styles.noteText}>
          {homeCopy.orderedNote}
        </ThemedText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[3],
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  columns: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  column: {
    flex: 1,
    gap: 2,
  },
  divider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing[3],
  },
  columnLabel: {
    color: colors.textSecondary,
  },
  columnValue: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  columnUnit: {
    color: colors.textTertiary,
  },
  columnSub: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  noteBox: {
    borderRadius: radius.btn,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  noteText: {
    color: colors.textTertiary,
    fontSize: 11,
    lineHeight: 15,
  },
});
