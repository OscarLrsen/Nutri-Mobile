import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Star } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { EmptyState } from "@/components/feedback/EmptyState";
import { useAuth } from "@/services/auth/AuthProvider";
import { getMyPointsTransactions, type ApiPointsTransaction } from "@/services/api/points";
import { getRewardStatus } from "@/services/api/rewards";
import { formatDate, useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Nutri-poäng — balance + ledger. Balance comes from GET /api/rewards/status
 * (already the single source for header/rewards data — no duplicate
 * endpoint); the ledger from GET /api/points/transactions. Reason labels
 * fall back to the raw enum name, so future earn reasons (referrals,
 * challenges, campaigns) render without an app update. Spending is
 * deliberately absent — display only in V1.
 */

function TransactionRow({ tx }: { tx: ApiPointsTransaction }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const label = t(`points.reasonNames.${tx.reason}`, { defaultValue: tx.reason });
  const icon = t(`points.reasonIcons.${tx.reason}`, { defaultValue: "⭐" });
  return (
    <View style={styles.txRow}>
      <View style={styles.txIconWrap}>
        <ThemedText style={styles.txIcon}>{icon}</ThemedText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText style={styles.txLabel}>{label}</ThemedText>
        <ThemedText style={styles.txDate}>
          {formatDate(new Date(tx.createdAt), language, { day: "numeric", month: "long" })}
        </ThemedText>
      </View>
      <ThemedText style={[styles.txAmount, tx.amount < 0 && styles.txAmountNegative]}>
        {tx.amount > 0 ? `+${tx.amount}` : `${tx.amount}`}
      </ThemedText>
    </View>
  );
}

export function PointsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();

  const statusQuery = useQuery({
    queryKey: ["rewards", "status", user?.id ?? null],
    queryFn: getRewardStatus,
    enabled: !!user,
  });
  const txQuery = useQuery({
    queryKey: ["points", "transactions", user?.id ?? null],
    queryFn: getMyPointsTransactions,
    enabled: !!user,
  });

  return (
    <Screen edges={["top", "bottom"]}>
      {/* Back header — same pattern as CouponListScreen/RewardsScreen */}
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"))}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={8}
        >
          <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{t("points.screenTitle")}</ThemedText>
        <View style={styles.backButton} />
      </View>

      {authLoading ? (
        <View style={styles.skeletons}>
          <Skeleton height={96} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : !user ? (
        <View style={styles.center}>
          <ThemedText style={styles.loginText}>{t("points.loginRequired")}</ThemedText>
          <Pressable
            onPress={() => router.push({ pathname: "/logga-in", params: { next: "/poang" } })}
            style={({ pressed }) => [
              styles.loginButton,
              pressed && { backgroundColor: colors.accentHover },
            ]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.loginButtonText}>{t("points.loginCta")}</ThemedText>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* ── Balance card ── */}
          {statusQuery.isLoading ? (
            <Skeleton height={96} />
          ) : (
            <View style={styles.balanceCard}>
              <View style={styles.balanceIconWrap}>
                <Star size={22} color={colors.accent} strokeWidth={1.75} />
              </View>
              <View>
                <ThemedText style={styles.balanceLabel}>{t("points.balanceLabel")}</ThemedText>
                <ThemedText style={styles.balanceValue}>
                  {statusQuery.data?.pointsBalance ?? "–"}{" "}
                  <ThemedText style={styles.balanceUnit}>{t("points.balanceUnit")}</ThemedText>
                </ThemedText>
              </View>
            </View>
          )}

          {/* ── Ledger ── */}
          <ThemedText style={styles.sectionHead}>{t("points.historyHead")}</ThemedText>
          {txQuery.isLoading ? (
            <View style={{ gap: spacing[3] }}>
              <Skeleton height={64} />
              <Skeleton height={64} />
              <Skeleton height={64} />
            </View>
          ) : txQuery.isError ? (
            <View style={styles.inlineError}>
              <ThemedText style={styles.errorText}>{t("points.fetchError")}</ThemedText>
              <Pressable
                onPress={() => txQuery.refetch()}
                style={styles.retryButton}
                accessibilityRole="button"
              >
                <ThemedText style={styles.retryText}>{t("points.retry")}</ThemedText>
              </Pressable>
            </View>
          ) : txQuery.data && txQuery.data.length > 0 ? (
            <View style={styles.txCard}>
              {txQuery.data.map((tx, i) => (
                <View key={tx.id}>
                  {i > 0 ? <View style={styles.txDivider} /> : null}
                  <TransactionRow tx={tx} />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState message={t("points.historyEmpty")} />
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  content: { padding: spacing[4], paddingBottom: spacing[8], gap: spacing[4] },
  skeletons: { padding: spacing[4], gap: spacing[4] },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[4],
    padding: spacing[6],
  },

  balanceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[4],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
    borderRadius: radius.card,
    padding: spacing[5],
  },
  balanceIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
  },
  balanceLabel: { fontSize: 11.5, color: colors.textTertiary },
  balanceValue: {
    fontSize: 26,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  balanceUnit: { fontSize: 13, fontFamily: fontFamily.bodyMedium, color: colors.textTertiary },

  sectionHead: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginTop: spacing[2],
  },
  txCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  txDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)" },
  txIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
  },
  txIcon: { fontSize: 15, lineHeight: 20 },
  txLabel: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  txDate: { marginTop: 1, fontSize: 11.5, color: colors.textTertiary },
  txAmount: { fontSize: 14, fontFamily: fontFamily.bodyBold, color: "#4ade80" },
  txAmountNegative: { color: "#f87171" },

  loginText: { fontSize: 13.5, color: colors.textSecondary, textAlign: "center" },
  loginButton: {
    height: 44,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
  },
  loginButtonText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  inlineError: { alignItems: "center", gap: spacing[3], paddingVertical: spacing[4] },
  errorText: { fontSize: 12.5, color: "#f87171", textAlign: "center" },
  retryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.35)",
    backgroundColor: "rgba(232,101,10,0.12)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  retryText: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: colors.accent },
});
