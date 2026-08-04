import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Clock } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useActiveOrder } from "@/features/order/useActiveOrder";
import { estimateWaitMinutes } from "@/features/order/orderStatusShared";
import { useTranslation } from "@/i18n";
import { colors, radius, spacing } from "@/theme";

/**
 * One slim, tappable line: "your order is live — this is where it is".
 *
 * Mounted at the top of the main tabs so leaving the status screen never
 * means losing the order. Renders nothing at all when no order is in flight,
 * so the screens that host it pay no layout cost in the ordinary case. Height
 * is deliberately one row — ambient awareness, not a second status screen.
 */
export function ActiveOrderBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { orderId, order, status, isActive } = useActiveOrder();

  if (!isActive || !orderId || !status) return null;

  const statusLabel =
    status === "ready"
      ? t("activeOrder.ready")
      : status === "inprogress"
        ? t("activeOrder.inProgress")
        : status === "awaiting_payment"
          ? t("activeOrder.awaitingPayment")
          : t("activeOrder.received");

  const eta = estimateWaitMinutes(status);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("activeOrder.open")}
      onPress={() => router.push(`/order/${orderId}`)}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <View style={[styles.dot, status === "ready" && styles.dotReady]} />
      <View style={styles.textWrap}>
        <ThemedText variant="bodyMedium" numberOfLines={1} style={styles.title}>
          {order?.orderNumber
            ? t("activeOrder.titleNumbered", { number: order.orderNumber })
            : t("activeOrder.title")}
        </ThemedText>
        <View style={styles.metaRow}>
          <ThemedText variant="caption" style={styles.status} numberOfLines={1}>
            {statusLabel}
          </ThemedText>
          {eta !== null && (
            <>
              <Clock size={11} color={colors.textTertiary} strokeWidth={2} />
              <ThemedText variant="caption" style={styles.eta}>
                {t("activeOrder.eta", { minutes: eta })}
              </ThemedText>
            </>
          )}
        </View>
      </View>
      <ChevronRight size={16} color={colors.textSecondary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginBottom: spacing[3],
  },
  pressed: { opacity: 0.85 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  dotReady: { backgroundColor: colors.success },
  textWrap: { flex: 1, gap: 2 },
  title: { fontSize: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing[1] },
  status: { color: colors.textSecondary },
  eta: { color: colors.textTertiary },
});
