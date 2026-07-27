import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Card } from "@/components/ui/Card";
import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { isProfileGapError, useTodayNutritionQuery } from "@/services/api/nutritionQueries";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { homeAccents } from "./homeAccents";

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
  const { t } = useTranslation();
  const router = useRouter();
  const todayQuery = useTodayNutritionQuery();

  if (todayQuery.isLoading) {
    return (
      <Card style={styles.card} accessibilityLabel={t("home.planHead")}>
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
  const target = today.adjustedTarget;
  const dayTypeName = today.dayType
    ? t(`profile.dayTypeNames.${today.dayType}`, { defaultValue: today.dayType })
    : null;

  return (
    <Card style={styles.card} accessibilityLabel={t("home.planHead")}>
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
          {t("home.kcalPerDay")}
        </ThemedText>
      </View>

      {/* Patch 11 visual pass: each macro cell carries its own accent
          (soft fill + top edge + coloured value) so the card reads with
          the same colour hierarchy as Meny. Labels stay — colour is never
          the only carrier. */}
      <View style={styles.macroRow}>
        <Macro label={t("home.macroProtein")} grams={target.proteinG} accent={homeAccents.protein} />
        <Macro label={t("home.macroCarbs")} grams={target.carbsG} accent={homeAccents.carbs} />
        <Macro label={t("home.macroFat")} grams={target.fatG} accent={homeAccents.fat} />
      </View>

      {!today.dayType ? (
        <ThemedText variant="caption" style={styles.noSchedule}>
          {t("home.noSchedule")}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function SectionLabel() {
  const { t } = useTranslation();
  return <ThemedText style={styles.sectionLabel}>{t("home.planHead").toUpperCase()}</ThemedText>;
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
