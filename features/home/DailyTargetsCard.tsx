import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Card } from "@/components/ui/Card";
import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { isProfileGapError, useTodayNutritionQuery } from "@/services/api/nutritionQueries";
import { homeCopy, menuCopy, profileCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * "Dagens plan" — today's carb-cycled targets from
 * /api/nutrition-profile/today via the shared nutrition query hooks.
 *
 * States: loading skeleton; 404/422 → missing-profile CTA into the existing
 * profile/onboarding flow on Mina sidor (no new onboarding logic); other
 * errors → inline retry; dayType null (no weekly schedule row today) →
 * base targets with an explanatory caption.
 */
export function DailyTargetsCard() {
  const router = useRouter();
  const todayQuery = useTodayNutritionQuery();

  if (todayQuery.isLoading) {
    return (
      <Card style={styles.card} accessibilityLabel={homeCopy.planHead}>
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
          {homeCopy.missingProfileTitle}
        </ThemedText>
        <ThemedText variant="caption" style={styles.missingBody}>
          {homeCopy.missingProfileBody}
        </ThemedText>
        <Pressable
          onPress={() => router.navigate("/(tabs)/konto")}
          style={({ pressed }) => [styles.missingCta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={homeCopy.missingProfileCta}
        >
          <ThemedText variant="bodyMedium" style={styles.missingCtaText}>
            {homeCopy.missingProfileCta}
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
          {homeCopy.planError}
        </ThemedText>
        <Pressable
          onPress={() => todayQuery.refetch()}
          style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={menuCopy.retry}
        >
          <ThemedText variant="caption" style={styles.retryText}>
            {menuCopy.retry}
          </ThemedText>
        </Pressable>
      </Card>
    );
  }

  const today = todayQuery.data;
  const target = today.adjustedTarget;
  const dayTypeName = today.dayType
    ? (profileCopy.dayTypeNames[today.dayType] ?? today.dayType)
    : null;

  return (
    <Card style={styles.card} accessibilityLabel={homeCopy.planHead}>
      <View style={styles.headRow}>
        <SectionLabel />
        {dayTypeName ? (
          <View style={styles.dayTypeChip}>
            <ThemedText style={styles.dayTypeText}>{dayTypeName.toUpperCase()}</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.kcalRow}>
        <ThemedText variant="monoLarge" style={styles.kcalValue}>
          {target.calories}
        </ThemedText>
        <ThemedText variant="caption" style={styles.kcalLabel}>
          {homeCopy.kcalPerDay}
        </ThemedText>
      </View>

      <View style={styles.macroRow}>
        <Macro label={homeCopy.macroProtein} grams={target.proteinG} highlight />
        <Macro label={homeCopy.macroCarbs} grams={target.carbsG} />
        <Macro label={homeCopy.macroFat} grams={target.fatG} />
      </View>

      {!today.dayType ? (
        <ThemedText variant="caption" style={styles.noSchedule}>
          {homeCopy.noSchedule}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function SectionLabel() {
  return <ThemedText style={styles.sectionLabel}>{homeCopy.planHead.toUpperCase()}</ThemedText>;
}

function Macro({ label, grams, highlight = false }: { label: string; grams: number; highlight?: boolean }) {
  return (
    <View style={styles.macro}>
      <ThemedText variant="monoLarge" style={[styles.macroValue, highlight && styles.macroValueHighlight]}>
        {grams}
        <ThemedText variant="caption" style={styles.macroUnit}>
          {homeCopy.gramUnit}
        </ThemedText>
      </ThemedText>
      <ThemedText variant="caption" style={styles.macroLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

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
    borderColor: colors.borderSoft,
    backgroundColor: colors.cardAlt,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  macroValue: {
    fontSize: 18,
    color: colors.textPrimary,
  },
  macroValueHighlight: {
    color: colors.accent,
  },
  macroUnit: {
    color: colors.textTertiary,
  },
  macroLabel: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  noSchedule: {
    color: colors.textTertiary,
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
