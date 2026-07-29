import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Ticket } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import {
  isStampCardUnavailableError,
  useStampCardFocusRefetch,
  useStampCardStatusQuery,
} from "@/services/api/stampCardQueries";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { homeAccents } from "@/features/home/homeAccents";

import { StampGrid } from "./StampGrid";

/**
 * "Ditt stämpelkort" on Home, inside the Nutri family section.
 *
 * Read-only in patch 16B: the reward can be earned and seen, but not spent —
 * redemption arrives with checkout in 16C. The reward panel is therefore
 * deliberately NOT a button and carries no call to action that could read as
 * "use it now"; it says outright that checkout is coming.
 *
 * Every number is the server's. The card never counts orders, never persists
 * a total, and never fills a stamp the backend has not confirmed.
 */
export function StampCardHomeCard() {
  const router = useRouter();
  const { t } = useTranslation();
  // Refetch every time Home regains focus. The kitchen marks orders
  // delivered from its own app, so nothing can push a new stamp into this
  // device's cache — and the shared 30s staleTime would otherwise let a
  // stamp the customer just earned stay invisible after they walk away
  // from the counter and reopen the app.
  useStampCardFocusRefetch();
  const query = useStampCardStatusQuery();

  // The API predates this feature (patch 16A not deployed to this
  // environment). Hide the card entirely rather than claim zero stamps: as
  // soon as the backend ships, the next fetch renders it with no app update.
  if (query.isError && isStampCardUnavailableError(query.error)) return null;

  if (query.isLoading || (!query.data && !query.isError)) {
    return (
      <View style={styles.card}>
        <Skeleton height={13} width={110} />
        <View style={styles.skeletonRow}>
          <Skeleton height={30} width="100%" />
        </View>
        <Skeleton height={12} width={160} />
      </View>
    );
  }

  // Error state ONLY when there is nothing to show. A failed background
  // refetch on a card that already loaded keeps rendering the last known
  // progress — replacing a real card with an error because the network
  // blinked would be worse information, not better.
  if (!query.data) {
    return (
      <View style={styles.card}>
        <ThemedText style={styles.title}>{t("stampCard.homeTitle")}</ThemedText>
        <ThemedText style={styles.errorText}>{t("stampCard.errorTitle")}</ThemedText>
        <Pressable
          onPress={() => void query.refetch()}
          style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t("stampCard.retry")}
        >
          <ThemedText style={styles.retryLabel}>{t("stampCard.retry")}</ThemedText>
        </Pressable>
      </View>
    );
  }

  const { currentStamps, stampsRequired, stampsRemaining, availableRewards } = query.data;
  const hasReward = availableRewards > 0;
  // A brand-new card AND no reward waiting — the only state that gets the
  // welcome copy. After a completed card currentStamps is also 0, but there
  // is a reward, so that state must not read as "you have not started".
  const isFirstCard = currentStamps === 0 && !hasReward;

  return (
    <Pressable
      onPress={() => router.push("/stampkort")}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.cardAlt }]}
      accessibilityRole="button"
      accessibilityLabel={t("stampCard.openDetailAria", {
        filled: currentStamps,
        total: stampsRequired,
      })}
      accessibilityHint={t("stampCard.openDetailHint")}
    >
      <View style={styles.head}>
        <View style={styles.iconWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ticket size={16} color={homeAccents.protein.value} strokeWidth={2} />
        </View>
        <ThemedText style={styles.title}>{t("stampCard.homeTitle")}</ThemedText>
        <ChevronRight size={15} color={colors.textTertiary} strokeWidth={2} />
      </View>

      <StampGrid filled={currentStamps} total={stampsRequired} animate />

      <View style={styles.copy}>
        {isFirstCard ? (
          <>
            <ThemedText style={styles.progress}>{t("stampCard.firstCardTitle")}</ThemedText>
            <ThemedText style={styles.hint}>{t("stampCard.firstCardBody")}</ThemedText>
          </>
        ) : (
          <>
            <ThemedText style={styles.progress}>
              {t("stampCard.progressCount", { filled: currentStamps, total: stampsRequired })}
            </ThemedText>
            <ThemedText style={styles.hint}>
              {/* A completed card also reads 0 of 10. Saying a new card has
                  started stops that zero from looking like lost stamps —
                  the reward panel right below already names the reward, so
                  repeating it here would just be noise. */}
              {hasReward && currentStamps === 0
                ? t("stampCard.completedBody")
                : t("stampCard.remainingShort", { count: stampsRemaining })}
            </ThemedText>
          </>
        )}
      </View>

      {hasReward ? <RewardPanel count={availableRewards} /> : null}
    </Pressable>
  );
}

/**
 * Earned-reward panel. An information surface, not a control: nothing here is
 * pressable, because in 16B there is nowhere for a press to go and a customer
 * who taps a reward expecting to spend it would rightly feel misled.
 */
function RewardPanel({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <View
      style={styles.reward}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${t("stampCard.rewardTitle", { count })}. ${t("stampCard.rewardBody")}`}
    >
      <View style={styles.rewardHead}>
        <ThemedText style={styles.rewardTitle}>{t("stampCard.rewardTitle", { count })}</ThemedText>
        <View style={styles.badge}>
          <ThemedText style={styles.badgeText}>{t("stampCard.rewardBadge")}</ThemedText>
        </View>
      </View>
      <ThemedText style={styles.rewardBody}>{t("stampCard.rewardBody")}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    gap: spacing[3],
    // Comfortably past the 44pt minimum target on its own.
    minHeight: 44,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: homeAccents.protein.soft,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.textPrimary,
  },
  skeletonRow: { paddingVertical: spacing[1] },
  copy: { gap: 2 },
  progress: {
    fontSize: 13.5,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.textPrimary,
  },
  hint: { fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
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
    fontSize: 13.5,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.textPrimary,
  },
  badge: {
    backgroundColor: homeAccents.protein.value,
    borderRadius: radius.chip,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 9.5,
    letterSpacing: 0.5,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.bg,
  },
  rewardBody: { fontSize: 12, lineHeight: 16.5, color: colors.textSecondary },
  errorText: { fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  retry: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingRight: spacing[3],
  },
  retryLabel: {
    fontSize: 13,
    fontFamily: fontFamily.headlineSemibold,
    color: homeAccents.protein.value,
  },
});
