import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { useCart } from "@/context/CartContext";
import { getOrderById, type ApiOrder } from "@/services/api/orders";
import { consumePendingStripeClear } from "@/utils/activeOrder";
import { formatPriceKr } from "@/utils/money";
import { orderStatusCopy as copy, checkoutCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Order confirmation — the Feature 5 landing after order creation. This is a
 * MINIMAL subset of the web (customer)/order/[id]/page.tsx (which is Feature
 * 8, Orderstatus): order number, per-state heading (awaiting payment /
 * stripe pending / active / completed / expired / cancelled), reservation
 * countdown for PendingPayment, the order-line summary and total. The full
 * web experience (progress steps, protein logging, confetti, live variation
 * screens) is deliberately NOT here yet.
 *
 * Polls GET /api/orders/{id} every 5s (the web polls its order page too) so
 * a pay_on_site confirmation or a Stripe webhook flips the state without a
 * manual refresh. When a Stripe order flagged by the cart reports Paid, the
 * cart is cleared exactly once (mobile equivalent of the web's one-shot
 * ?stripe=success clear).
 */
export function OrderConfirmationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { clearCart } = useCart();

  const orderQuery = useQuery({
    queryKey: ["orders", id],
    queryFn: () => getOrderById(id),
    enabled: !!id,
    refetchInterval: 5000,
  });
  const order = orderQuery.data ?? null;

  // One-time cart clear once the Stripe order this cart started reports Paid.
  const clearedRef = useRef(false);
  useEffect(() => {
    if (!order || clearedRef.current) return;
    if (order.paymentMethod !== "stripe" || order.paymentStatus !== "Paid") return;
    clearedRef.current = true;
    consumePendingStripeClear(order.id).then((shouldClear) => {
      if (shouldClear) clearCart();
    });
  }, [order, clearCart]);

  if (orderQuery.isLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <LoadingIndicator />
      </View>
    );
  }

  if (orderQuery.isError || !order) {
    return (
      <View style={[styles.root, styles.center, { gap: spacing[3] }]}>
        <AlertCircle size={40} color="#f87171" />
        <ThemedText style={styles.stateTitle}>{copy.notFoundTitle}</ThemedText>
        <Pressable onPress={() => router.navigate("/(tabs)/meny")} accessibilityRole="link">
          <ThemedText style={styles.link}>{copy.notFoundCta}</ThemedText>
        </Pressable>
      </View>
    );
  }

  const isStripe = order.paymentMethod === "stripe";
  const isPending = order.status === "PendingPayment";
  const isExpired = order.status === "Expired";
  const isCancelled = order.status === "Cancelled";
  const isCompleted = order.status === "Delivered";

  const heading = isExpired
    ? copy.expiredTitle
    : isCancelled
      ? copy.cancelledTitle
      : isPending
        ? isStripe
          ? copy.stripePendingTitle
          : checkoutCopy.infoHeading
        : isCompleted
          ? copy.completedTitle
          : copy.activeTitle;
  const body = isExpired
    ? copy.expiredBody
    : isCancelled
      ? copy.cancelledBody
      : isPending
        ? isStripe
          ? copy.stripePendingBody
          : checkoutCopy.infoText
        : isCompleted
          ? copy.completedBody(order.orderNumber)
          : (statusStepLabel(order.status) ?? "");

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"))}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Tillbaka"
        >
          <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
        </Pressable>
        <ThemedText style={styles.wordmark}>NUTRI</ThemedText>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing[8] }]}>
        {/* State heading */}
        <ThemedText style={styles.stateTitle}>{heading}</ThemedText>
        {body ? <ThemedText style={styles.stateBody}>{body}</ThemedText> : null}

        {/* Order number (web: big centered number + "visa i kassan") */}
        <View style={styles.numberBlock}>
          <ThemedText style={styles.numberLabel}>{copy.orderNumber.toUpperCase()}</ThemedText>
          <ThemedText style={styles.numberValue}>#{order.orderNumber}</ThemedText>
          {isPending && !isStripe ? (
            <ThemedText style={styles.numberHint}>{copy.showNumber}</ThemedText>
          ) : null}
        </View>

        {/* Reservation countdown for pending orders */}
        {isPending && order.reservedUntil ? (
          <Countdown
            reservedUntil={order.reservedUntil}
            sublabel={isStripe ? copy.stripePendingReservation : copy.countdownLeft}
          />
        ) : null}

        {/* Order lines summary */}
        <ThemedText style={styles.sectionHead}>
          {copy.sectionOrderSummary.toUpperCase()}
        </ThemedText>
        <View style={styles.linesCard}>
          {order.lines.map((line, i) => (
            <View
              key={line.id}
              style={[styles.lineRow, i < order.lines.length - 1 && styles.lineRowBorder]}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.lineTitle}>
                  {line.quantity > 1 ? `${line.quantity} × ` : ""}
                  {line.titleSnapshot}
                </ThemedText>
                {copy.sizeNames[line.size] ? (
                  <ThemedText style={styles.lineMeta}>{copy.sizeNames[line.size]}</ThemedText>
                ) : null}
              </View>
              <ThemedText style={styles.linePrice}>{formatPriceKr(line.lineTotalOre)}</ThemedText>
            </View>
          ))}
          <View style={[styles.lineRow, styles.totalRow]}>
            <ThemedText style={styles.totalLabel}>{copy.total}</ThemedText>
            <ThemedText style={styles.totalValue}>{formatPriceKr(order.totalOre)}</ThemedText>
          </View>
        </View>

        {(isExpired || isCancelled || isCompleted) && (
          <Pressable
            onPress={() => router.navigate("/(tabs)/meny")}
            style={({ pressed }) => [styles.cta, pressed && { backgroundColor: colors.accentHover }]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.ctaText}>
              {isExpired ? copy.expiredNewOrder : copy.toMenu}
            </ThemedText>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

/** Web statuses Pending/Confirmed/Preparing/Ready → the verified step labels. */
function statusStepLabel(status: ApiOrder["status"] | string): string | null {
  if (status === "Preparing") return copy.stepPreparing;
  if (status === "Ready") return copy.stepReadyPickup;
  if (status === "Pending" || status === "Confirmed") return copy.stepReceived;
  return null;
}

/** mm:ss countdown to reservedUntil — port of the web page's useCountdown. */
function Countdown({ reservedUntil, sublabel }: { reservedUntil: string; sublabel: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const msLeft = new Date(reservedUntil).getTime() - now;
  if (isNaN(msLeft)) return null;
  const expired = msLeft <= 0;
  const totalSec = Math.max(0, Math.floor(msLeft / 1000));
  const label = `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;

  return (
    <View style={styles.countdownCard}>
      {expired ? (
        <ThemedText style={styles.countdownExpired}>{copy.countdownExpired}</ThemedText>
      ) : (
        <>
          <ThemedText style={styles.countdownValue}>{label}</ThemedText>
          <ThemedText style={styles.countdownSub}>{sublabel}</ThemedText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[2],
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 3,
    color: colors.textPrimary,
  },
  content: { paddingHorizontal: spacing[5], paddingTop: spacing[6], gap: spacing[4] },
  stateTitle: {
    textAlign: "center",
    fontSize: 20,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
  },
  stateBody: {
    marginTop: -spacing[2],
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.53)",
  },
  link: { fontSize: 14, color: colors.accent },
  numberBlock: { alignItems: "center", gap: 2 },
  numberLabel: { fontSize: 11, letterSpacing: 1.4, color: "rgba(255,255,255,0.33)" },
  numberValue: {
    fontSize: 48,
    fontFamily: fontFamily.monoMedium,
    color: colors.textPrimary,
    lineHeight: 56,
  },
  numberHint: { fontSize: 12, color: "rgba(255,255,255,0.4)" },
  countdownCard: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  countdownValue: {
    fontSize: 28,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  countdownSub: { marginTop: 2, fontSize: 12, color: "rgba(255,255,255,0.33)" },
  countdownExpired: { fontSize: 14, color: "#f87171" },
  sectionHead: {
    marginTop: spacing[2],
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    color: colors.textMuted,
  },
  linesCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  lineRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  lineTitle: { fontSize: 13.5, fontFamily: fontFamily.bodyMedium, color: colors.textPrimary },
  lineMeta: { marginTop: 2, fontSize: 11.5, color: "rgba(255,255,255,0.4)" },
  linePrice: { fontSize: 13.5, fontFamily: fontFamily.monoMedium, color: colors.textPrimary },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  totalValue: { fontSize: 16, fontFamily: fontFamily.monoMedium, color: colors.textPrimary },
  cta: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
});
