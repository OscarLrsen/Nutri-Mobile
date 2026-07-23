import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Gift, Star } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { useAuth } from "@/services/auth/AuthProvider";
import { getRewardStatus } from "@/services/api/rewards";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Nutri-poäng summary. The entire card is one route to /poang; the separate
 * weekly-reward entry remains the gift button in Home's header. Keeping one
 * press target avoids competing nested links while retaining the shared
 * rewards/status cache as the balance source.
 */
export function RewardsSummaryCard() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();

  const statusQuery = useQuery({
    queryKey: ["rewards", "status", user?.id ?? null],
    queryFn: getRewardStatus,
    enabled: !!user,
  });

  const status = statusQuery.data ?? null;
  const canSpin = status?.canSpin === true;
  const balanceLabel = status
    ? `${status.pointsBalance} ${t("points.balanceUnit")}`
    : t("home.pointsHead");

  return (
    <Pressable
      onPress={() => router.push("/poang")}
      style={({ pressed }) => [styles.pressTarget, pressed && styles.pressTargetPressed]}
      accessibilityRole="button"
      accessibilityLabel={
        status
          ? t("home.pointsCardAriaWithBalance", { balance: balanceLabel })
          : t("home.pointsCardAria")
      }
      accessibilityHint={t("home.pointsCardHint")}
    >
      <LinearGradient
        colors={["rgba(232,101,10,0.17)", "rgba(34,27,23,0.96)", colors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View pointerEvents="none" style={styles.glow} />

        <View style={styles.headRow}>
          <View style={styles.iconWrap}>
            <Star size={19} color="#FFAA5B" strokeWidth={2} />
          </View>
          <View style={styles.headingBlock}>
            <ThemedText style={styles.sectionLabel}>{t("home.pointsHead").toUpperCase()}</ThemedText>
            <ThemedText style={styles.openHint}>{t("home.pointsSubtitle")}</ThemedText>
          </View>
          <View style={styles.chevronWrap}>
            <ChevronRight size={17} color="rgba(255,255,255,0.48)" strokeWidth={2.2} />
          </View>
        </View>

        {statusQuery.isLoading ? (
          <Skeleton height={34} width={132} />
        ) : (
          <View style={styles.balanceRow}>
            <ThemedText variant="monoLarge" style={styles.balanceValue}>
              {status ? status.pointsBalance : "–"}
            </ThemedText>
            <ThemedText variant="caption" style={styles.balanceUnit}>
              {t("points.balanceUnit")}
            </ThemedText>
          </View>
        )}

        {canSpin ? (
          <View style={styles.spinStatus}>
            <Gift size={14} color={colors.accent} strokeWidth={2} />
            <ThemedText variant="caption" style={styles.spinStatusText}>
              {t("home.spinReady")}
            </ThemedText>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressTarget: {
    borderRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  pressTargetPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.988 }],
  },
  card: {
    overflow: "hidden",
    minHeight: 132,
    gap: spacing[2],
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,151,63,0.24)",
    padding: spacing[4],
  },
  glow: {
    position: "absolute",
    width: 142,
    height: 142,
    borderRadius: 71,
    top: -82,
    right: -34,
    backgroundColor: "rgba(232,101,10,0.13)",
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,164,81,0.24)",
  },
  headingBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.4,
    color: "rgba(255,220,186,0.8)",
  },
  openHint: {
    fontSize: 11.5,
    color: colors.textTertiary,
  },
  chevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing[2],
  },
  balanceValue: {
    fontSize: 32,
    lineHeight: 38,
    color: colors.textPrimary,
  },
  balanceUnit: {
    color: colors.textSecondary,
  },
  spinStatus: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    borderRadius: 999,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    backgroundColor: "rgba(232,101,10,0.1)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.2)",
  },
  spinStatusText: {
    color: colors.accent,
    fontFamily: fontFamily.bodySemibold,
  },
});
