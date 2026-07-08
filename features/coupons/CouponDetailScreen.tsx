import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgePercent } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { EmptyState } from "@/components/feedback/EmptyState";
import { useAuth } from "@/services/auth/AuthProvider";
import { useCart } from "@/context/CartContext";
import { useCoupon } from "@/context/CouponContext";
import { getMyCoupons, isCouponUsable } from "@/services/api/coupons";
import { couponCopy as copy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { COUPON_STATUS_COLORS, couponMetaLine } from "./couponFormat";

/**
 * Coupon detail — the tapped coupon from Mina kuponger. There is no
 * GET /api/coupons/{id} on the backend, so the coupon is resolved from the
 * same ["coupons", userId] query the list uses (cache hit in the normal
 * navigation flow, refetch on deep-entry/mount).
 *
 * "Använd" selects the coupon for checkout (CouponContext) and continues to
 * the cart (if it has items) or the menu — the actual redemption happens
 * server-side when the order is placed.
 */
export function CouponDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { items } = useCart();
  const { selectedCoupon, selectCoupon, clearSelectedCoupon } = useCoupon();

  const couponsQuery = useQuery({
    queryKey: ["coupons", user?.id ?? null],
    queryFn: getMyCoupons,
    enabled: !!user,
  });

  const coupon = couponsQuery.data?.find((c) => c.id === id) ?? null;
  const isSelected = !!coupon && selectedCoupon?.id === coupon.id;
  const usable = !!coupon && isCouponUsable(coupon);

  const handleUse = () => {
    if (!coupon || !usable) return;
    selectCoupon(coupon);
    router.navigate(items.length > 0 ? "/(tabs)/varukorg" : "/(tabs)/meny");
  };

  const statusCfg = coupon
    ? (COUPON_STATUS_COLORS[coupon.status] ?? COUPON_STATUS_COLORS.Used)
    : null;

  return (
    <Screen edges={["top", "bottom"]}>
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
        <ThemedText style={styles.headerTitle}>{copy.detailTitle}</ThemedText>
        <View style={styles.backButton} />
      </View>

      {authLoading || (couponsQuery.isLoading && !!user) ? (
        <View style={styles.center}>
          <LoadingIndicator />
        </View>
      ) : !coupon ? (
        <EmptyState message={copy.detailNotFound} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <BadgePercent size={26} color={colors.accent} strokeWidth={1.75} />
            </View>
            <ThemedText style={styles.code}>{coupon.code}</ThemedText>
            <ThemedText style={styles.percent}>{copy.percentOff(coupon.percentage)}</ThemedText>
            {statusCfg ? (
              <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                <ThemedText style={[styles.statusBadgeText, { color: statusCfg.color }]}>
                  {copy.statusNames[coupon.status] ?? coupon.status}
                </ThemedText>
              </View>
            ) : null}
            <ThemedText style={styles.meta}>{couponMetaLine(coupon)}</ThemedText>
          </View>

          <View style={styles.infoBox}>
            <ThemedText style={styles.infoText}>{copy.detailHowItWorks}</ThemedText>
          </View>

          {usable ? (
            isSelected ? (
              <>
                <View style={styles.selectedBox}>
                  <ThemedText style={styles.selectedText}>{copy.selected}</ThemedText>
                </View>
                <Pressable
                  onPress={clearSelectedCoupon}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && { backgroundColor: "rgba(255,255,255,0.08)" },
                  ]}
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.secondaryButtonText}>
                    {copy.removeSelection}
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={handleUse}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && { backgroundColor: colors.accentHover },
                ]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.primaryButtonText}>{copy.use}</ThemedText>
              </Pressable>
            )
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing[4], paddingBottom: spacing[8] },

  card: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[6],
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
    marginBottom: spacing[4],
  },
  code: {
    fontSize: 20,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  percent: { marginTop: 4, fontSize: 14, color: colors.accent },
  statusBadge: {
    marginTop: spacing[3],
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 11, fontFamily: fontFamily.bodySemibold },
  meta: { marginTop: spacing[3], fontSize: 12.5, color: colors.textTertiary },

  infoBox: {
    marginTop: spacing[4],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.18)",
    backgroundColor: "rgba(232,101,10,0.08)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  infoText: { fontSize: 11.5, lineHeight: 17, color: "rgba(255,255,255,0.6)" },

  selectedBox: {
    marginTop: spacing[4],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.28)",
    backgroundColor: "rgba(74,222,128,0.08)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  selectedText: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: "#4ade80" },

  primaryButton: {
    height: 50,
    marginTop: spacing[5],
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  secondaryButton: {
    height: 48,
    marginTop: spacing[3],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: fontFamily.bodySemibold,
    color: "rgba(255,255,255,0.85)",
  },
});
