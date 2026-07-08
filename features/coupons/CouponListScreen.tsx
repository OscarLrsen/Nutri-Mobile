import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgePercent, CheckCircle2, ChevronRight, Gift } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { EmptyState } from "@/components/feedback/EmptyState";
import { useAuth } from "@/services/auth/AuthProvider";
import { useCoupon } from "@/context/CouponContext";
import {
  claimWelcomeCoupon,
  getMyCoupons,
  WELCOME_COUPON_SOURCE,
  type ApiCoupon,
} from "@/services/api/coupons";
import { couponCopy as copy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { COUPON_STATUS_COLORS, couponMetaLine } from "./couponFormat";

/**
 * Mina kuponger — list of the user's own coupons (GET /api/coupons; the
 * backend flips stale Active→Expired on read, so statuses render truthfully).
 * When no welcome coupon exists yet (e.g. the welcome modal was dismissed),
 * a claim card offers it here — the claim endpoint is idempotent, so this
 * can never mint a duplicate.
 */

function StatusBadge({ status }: { status: string }) {
  const cfg = COUPON_STATUS_COLORS[status] ?? COUPON_STATUS_COLORS.Used;
  const label = copy.statusNames[status] ?? status;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <ThemedText style={[styles.statusBadgeText, { color: cfg.color }]}>{label}</ThemedText>
    </View>
  );
}

function CouponCard({ coupon, isSelected }: { coupon: ApiCoupon; isSelected: boolean }) {
  const router = useRouter();
  const inactive = coupon.status !== "Active";
  return (
    <Pressable
      onPress={() => router.push(`/kupong/${coupon.id}`)}
      style={({ pressed }) => [
        styles.card,
        inactive && { opacity: 0.55 },
        pressed && { backgroundColor: colors.cardAlt },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${coupon.code}, ${copy.percentOff(coupon.percentage)}`}
    >
      <View style={styles.cardIcon}>
        <BadgePercent size={20} color={colors.accent} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.cardTitleRow}>
          <ThemedText style={styles.cardCode}>{coupon.code}</ThemedText>
          <StatusBadge status={coupon.status} />
          {isSelected ? <CheckCircle2 size={14} color="#4ade80" /> : null}
        </View>
        <ThemedText style={styles.cardPercent}>{copy.percentOff(coupon.percentage)}</ThemedText>
        <ThemedText style={styles.cardMeta}>{couponMetaLine(coupon)}</ThemedText>
      </View>
      <ChevronRight size={15} color="rgba(255,255,255,0.3)" />
    </Pressable>
  );
}

function ClaimWelcomeCard() {
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState(false);

  const handleClaim = async () => {
    if (claiming) return;
    setClaiming(true);
    setError(false);
    try {
      await claimWelcomeCoupon();
      await queryClient.invalidateQueries({ queryKey: ["coupons"] });
    } catch {
      setError(true);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <View style={styles.claimCard}>
      <View style={styles.claimIconWrap}>
        <Gift size={20} color={colors.accent} strokeWidth={1.75} />
      </View>
      <ThemedText style={styles.claimTitle}>{copy.claimCardTitle}</ThemedText>
      <ThemedText style={styles.claimBody}>{copy.claimCardBody}</ThemedText>
      {error ? <ThemedText style={styles.errorText}>{copy.claimCardError}</ThemedText> : null}
      <Pressable
        onPress={handleClaim}
        disabled={claiming}
        style={({ pressed }) => [
          styles.claimButton,
          pressed && !claiming && { backgroundColor: colors.accentHover },
          claiming && { opacity: 0.6 },
        ]}
        accessibilityRole="button"
      >
        <ThemedText style={styles.claimButtonText}>{copy.claimCardCta}</ThemedText>
      </Pressable>
    </View>
  );
}

export function CouponListScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { selectedCoupon } = useCoupon();

  const couponsQuery = useQuery({
    queryKey: ["coupons", user?.id ?? null],
    queryFn: getMyCoupons,
    enabled: !!user,
  });

  const coupons = couponsQuery.data;
  const hasWelcomeCoupon = coupons?.some((c) => c.source === WELCOME_COUPON_SOURCE) ?? true;

  return (
    <Screen edges={["top", "bottom"]}>
      {/* Back header — same pattern as OrderStatusScreen */}
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"))}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Tillbaka"
          hitSlop={8}
        >
          <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{copy.listTitle}</ThemedText>
        <View style={styles.backButton} />
      </View>

      {authLoading ? (
        <View style={styles.center}>
          <LoadingIndicator />
        </View>
      ) : !user ? (
        <View style={styles.center}>
          <ThemedText style={styles.loginText}>{copy.loginRequired}</ThemedText>
          <Pressable
            onPress={() => router.push({ pathname: "/logga-in", params: { next: "/kuponger" } })}
            style={({ pressed }) => [
              styles.claimButton,
              { alignSelf: "center", paddingHorizontal: spacing[6] },
              pressed && { backgroundColor: colors.accentHover },
            ]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.claimButtonText}>{copy.loginCta}</ThemedText>
          </Pressable>
        </View>
      ) : couponsQuery.isLoading ? (
        <View style={styles.center}>
          <LoadingIndicator />
        </View>
      ) : couponsQuery.isError ? (
        <View style={styles.center}>
          <ThemedText style={styles.errorText}>{copy.listFetchError}</ThemedText>
          <Pressable
            onPress={() => couponsQuery.refetch()}
            style={styles.retryButton}
            accessibilityRole="button"
          >
            <ThemedText style={styles.retryText}>{copy.retry}</ThemedText>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {!hasWelcomeCoupon ? <ClaimWelcomeCard /> : null}
          {coupons && coupons.length > 0 ? (
            <View style={{ gap: spacing[3] }}>
              {coupons.map((coupon) => (
                <CouponCard
                  key={coupon.id}
                  coupon={coupon}
                  isSelected={selectedCoupon?.id === coupon.id}
                />
              ))}
            </View>
          ) : hasWelcomeCoupon ? (
            <EmptyState message={copy.listEmpty} />
          ) : null}
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[4],
    padding: spacing[6],
  },
  listContent: { padding: spacing[4], paddingBottom: spacing[8], flexGrow: 1 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  cardCode: {
    fontSize: 14,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 0.5,
    color: colors.textPrimary,
  },
  cardPercent: { marginTop: 2, fontSize: 12.5, color: colors.accent },
  cardMeta: { marginTop: 2, fontSize: 11.5, color: colors.textTertiary },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10.5, fontFamily: fontFamily.bodySemibold },

  claimCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.28)",
    borderRadius: radius.card,
    padding: spacing[5],
    marginBottom: spacing[4],
  },
  claimIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
    marginBottom: spacing[3],
  },
  claimTitle: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  claimBody: { marginTop: 4, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  claimButton: {
    height: 44,
    marginTop: spacing[4],
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  claimButtonText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },

  loginText: { fontSize: 13.5, color: colors.textSecondary, textAlign: "center" },
  errorText: { fontSize: 12.5, color: "#f87171", textAlign: "center", marginTop: spacing[2] },
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
