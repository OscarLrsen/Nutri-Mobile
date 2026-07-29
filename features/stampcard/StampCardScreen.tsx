import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, Ticket } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import {
  isStampCardUnavailableError,
  useStampCardFocusRefetch,
  useStampCardHistoryQuery,
  useStampCardStatusQuery,
} from "@/services/api/stampCardQueries";
import type {
  ApiStampCardHistoryEntry,
  ApiStampCardHistoryReward,
} from "@/services/api/stampCard";
import { formatDate, useLanguage, useTranslation } from "@/i18n";
import { formatPriceKr } from "@/utils/money";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { homeAccents } from "@/features/home/homeAccents";

import { StampGrid } from "./StampGrid";

/**
 * "/stampkort" — the full stamp card: progress, earned rewards, the rules,
 * and recent activity.
 *
 * Read-only, exactly like the Home card. The rules deliberately describe the
 * whole model including redemption, because a customer deciding whether to
 * collect stamps needs to know that drinks do not count and that the free
 * meal cannot be stacked with another discount — even while the checkout half
 * is still being built.
 */
export function StampCardScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  useStampCardFocusRefetch();
  const statusQuery = useStampCardStatusQuery();
  const historyQuery = useStampCardHistoryQuery();

  const status = statusQuery.data ?? null;
  const unavailable = statusQuery.isError && isStampCardUnavailableError(statusQuery.error);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={8}
        >
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <ThemedText accessibilityRole="header" style={styles.headerTitle}>
          {t("stampCard.homeTitle")}
        </ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {unavailable ? (
          <View style={styles.card}>
            <ThemedText style={styles.progressTitle}>{t("stampCard.unavailableTitle")}</ThemedText>
            <ThemedText style={styles.body}>{t("stampCard.unavailableBody")}</ThemedText>
          </View>
        ) : status ? (
          // Cached progress wins over a failed refetch — same reasoning as
          // the Home card: last known truth beats an error panel.
          <>
            <ProgressCard status={status} />
            <RulesCard maxValueOre={status.maxValueOre} />
            <HistorySection
              entries={historyQuery.data?.entries ?? []}
              rewards={historyQuery.data?.rewards ?? []}
              isLoading={historyQuery.isLoading}
              isError={historyQuery.isError}
            />
          </>
        ) : statusQuery.isError ? (
          <View style={styles.card}>
            <ThemedText style={styles.progressTitle}>{t("stampCard.errorTitle")}</ThemedText>
            <Pressable
              onPress={() => void statusQuery.refetch()}
              style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={t("stampCard.retry")}
            >
              <ThemedText style={styles.retryLabel}>{t("stampCard.retry")}</ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Skeleton height={46} width="100%" />
            <Skeleton height={46} width="100%" />
            <Skeleton height={16} width={180} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function ProgressCard({
  status,
}: {
  status: NonNullable<ReturnType<typeof useStampCardStatusQuery>["data"]>;
}) {
  const { t } = useTranslation();
  const { currentStamps, stampsRequired, stampsRemaining, availableRewards, maxValueOre } = status;
  const maxValue = useFormattedPrice(maxValueOre);
  const hasReward = availableRewards > 0;
  const isFirstCard = currentStamps === 0 && !hasReward;

  return (
    <View style={styles.card}>
      <StampGrid filled={currentStamps} total={stampsRequired} size="large" animate />

      <View style={styles.copy}>
        {isFirstCard ? (
          <>
            <ThemedText style={styles.progressTitle}>{t("stampCard.firstCardTitle")}</ThemedText>
            <ThemedText style={styles.body}>{t("stampCard.firstCardBody")}</ThemedText>
          </>
        ) : currentStamps === 0 && hasReward ? (
          <>
            {/* A completed card: the backend has already opened the next one,
                so this must never read as "you are back to nothing". */}
            <ThemedText style={styles.progressTitle}>
              {t("stampCard.completedTitle", { count: availableRewards })}
            </ThemedText>
            <ThemedText style={styles.body}>{t("stampCard.completedBody")}</ThemedText>
          </>
        ) : (
          <>
            <ThemedText style={styles.progressTitle}>
              {t("stampCard.progressStamps", { filled: currentStamps, total: stampsRequired })}
            </ThemedText>
            <ThemedText style={styles.body}>
              {t("stampCard.remainingLong", { count: stampsRemaining })}
            </ThemedText>
          </>
        )}
      </View>

      {hasReward ? (
        <View
          style={styles.reward}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${t("stampCard.rewardTitle", { count: availableRewards })}. ${t("stampCard.rewardBody")}`}
        >
          <View style={styles.rewardHead}>
            <Ticket size={15} color={homeAccents.protein.value} strokeWidth={2} />
            <ThemedText style={styles.rewardTitle}>
              {t("stampCard.rewardTitle", { count: availableRewards })}
            </ThemedText>
          </View>
          <ThemedText style={styles.rewardBody}>{t("stampCard.rewardBody")}</ThemedText>
          <ThemedText style={styles.rewardValue}>
            {t("stampCard.rewardValue", { maxValue })}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

/** Öre → kronor through the shared helper. The cap is admin-controlled
 * server-side and must never be hardcoded in copy. */
function useFormattedPrice(ore: number): string {
  const { language } = useLanguage();
  return formatPriceKr(ore, language);
}

function RulesCard({ maxValueOre }: { maxValueOre: number }) {
  const { t } = useTranslation();
  const maxValue = useFormattedPrice(maxValueOre);

  const rules = [
    t("stampCard.ruleMeals"),
    t("stampCard.ruleHeldag"),
    t("stampCard.ruleDrinks"),
    t("stampCard.rulePickup"),
    t("stampCard.ruleFreeMeal"),
    t("stampCard.ruleNoCombine"),
    t("stampCard.ruleComingSoon"),
  ];

  return (
    <View style={styles.card}>
      <ThemedText accessibilityRole="header" style={styles.sectionTitle}>
        {t("stampCard.howItWorksTitle")}
      </ThemedText>
      <ThemedText style={styles.body}>{t("stampCard.howItWorksBody")}</ThemedText>
      <ThemedText style={styles.body}>{t("stampCard.rewardValue", { maxValue })}</ThemedText>

      <View style={styles.rules}>
        {rules.map((rule) => (
          <View key={rule} style={styles.ruleRow}>
            <Check size={13} color={colors.textTertiary} strokeWidth={2.5} style={styles.ruleIcon} />
            <ThemedText style={styles.ruleText}>{rule}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Recent activity, newest first — ledger rows and earned rewards merged into
 * one timeline so "the card filled up" appears where it happened rather than
 * in a separate list the customer has to reconcile by date.
 */
function HistorySection({
  entries,
  rewards,
  isLoading,
  isError,
}: {
  entries: ApiStampCardHistoryEntry[];
  rewards: ApiStampCardHistoryReward[];
  isLoading: boolean;
  isError: boolean;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();

  type Item =
    | { kind: "entry"; at: string; entry: ApiStampCardHistoryEntry }
    | { kind: "reward"; at: string; reward: ApiStampCardHistoryReward };

  const items: Item[] = [
    ...entries.map((entry) => ({ kind: "entry" as const, at: entry.createdAt, entry })),
    ...rewards.map((reward) => ({ kind: "reward" as const, at: reward.earnedAt, reward })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <View style={styles.card}>
      <ThemedText accessibilityRole="header" style={styles.sectionTitle}>
        {t("stampCard.activityTitle")}
      </ThemedText>

      {isLoading ? (
        <>
          <Skeleton height={16} width="80%" />
          <Skeleton height={16} width="60%" />
        </>
      ) : isError ? (
        <ThemedText style={styles.body}>{t("stampCard.activityError")}</ThemedText>
      ) : items.length === 0 ? (
        <>
          <ThemedText style={styles.emptyTitle}>{t("stampCard.activityEmptyTitle")}</ThemedText>
          <ThemedText style={styles.body}>{t("stampCard.activityEmptyBody")}</ThemedText>
        </>
      ) : (
        items.map((item) => {
          const date = formatDate(new Date(item.at), language, {
            day: "numeric",
            month: "long",
            year: "numeric",
          });

          if (item.kind === "reward") {
            return (
              <View key={`reward-${item.reward.id}`} style={styles.activityRow}>
                <ThemedText style={styles.activityLabel}>
                  {t("stampCard.activityRewardTitle")}
                </ThemedText>
                <ThemedText style={styles.activityMeta}>
                  {t("stampCard.activityRewardBody")} · {date}
                </ThemedText>
              </View>
            );
          }

          const { entry } = item;
          const amount = Math.abs(entry.quantity);
          // Reversals and admin corrections are already rendered here even
          // though patch 16A never writes them, so those patches need no app
          // update. Unknown future types fall back to the neutral label.
          const label =
            entry.entryType === "Reversed"
              ? t("stampCard.activityReversed", { count: amount })
              : entry.entryType === "AdminAdjustment"
                ? entry.quantity < 0
                  ? t("stampCard.activityAdjustedDown", { count: amount })
                  : t("stampCard.activityAdjustedUp", { count: amount })
                : t("stampCard.activityEarned", { count: amount });

          return (
            <View key={`entry-${entry.id}`} style={styles.activityRow}>
              <ThemedText style={styles.activityLabel}>{label}</ThemedText>
              <ThemedText style={styles.activityMeta}>
                {entry.orderNumber !== null
                  ? `${t("stampCard.activityOrder", { number: entry.orderNumber })} · ${date}`
                  : date}
              </ThemedText>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  back: { width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: {
    fontSize: 18,
    fontFamily: fontFamily.headlineSemibold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  scroll: { paddingHorizontal: spacing[4], paddingBottom: spacing[8], gap: spacing[3] },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    gap: spacing[3],
  },
  copy: { gap: 3 },
  progressTitle: {
    fontSize: 16,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.textPrimary,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.textPrimary,
  },
  body: { fontSize: 13, lineHeight: 18.5, color: colors.textSecondary },
  reward: {
    backgroundColor: homeAccents.protein.soft,
    borderWidth: 1,
    borderColor: homeAccents.protein.border,
    borderRadius: radius.btn,
    padding: spacing[3],
    gap: 4,
  },
  rewardHead: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  rewardTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.textPrimary,
  },
  rewardBody: { fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  rewardValue: { fontSize: 12, lineHeight: 16.5, color: colors.textTertiary },
  rules: { gap: spacing[2] },
  ruleRow: { flexDirection: "row", gap: spacing[2] },
  ruleIcon: { marginTop: 3 },
  ruleText: { flex: 1, fontSize: 12.5, lineHeight: 17.5, color: colors.textSecondary },
  activityRow: { gap: 2 },
  activityLabel: {
    fontSize: 13.5,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.textPrimary,
  },
  activityMeta: { fontSize: 12, color: colors.textSecondary },
  emptyTitle: {
    fontSize: 14,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.textPrimary,
  },
  retry: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  retryLabel: {
    fontSize: 13.5,
    fontFamily: fontFamily.headlineSemibold,
    color: homeAccents.protein.value,
  },
});
