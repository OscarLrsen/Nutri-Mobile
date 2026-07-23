import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChefHat,
  Clock,
  CreditCard,
  Lock,
  Menu,
  ShoppingBag,
} from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { useCart } from "@/context/CartContext";
import { getOrderById, type ApiOrder } from "@/services/api/orders";
import type { ApiError } from "@/types/api";
import { consumePendingStripeClear } from "@/utils/activeOrder";
import { formatDate, formatNumber, formatTime, useLanguage, useTranslation } from "@/i18n";
import type { AppLanguage } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Order status — full port of the web (customer)/order/[id]/page.tsx.
 *
 * State machine (web's toCustomerStatus, byte-for-byte):
 *   PendingPayment → awaiting_payment (two variants: Stripe-pending and
 *   pay-at-counter with countdown + vertical pay stepper)
 *   Pending → created / Confirmed+Preparing → inprogress / Ready → ready
 *   (the web's "Variation B" active-kitchen screen: hero, pulsing status
 *   pill, wait estimate, 3-step progress, summary, pickup card)
 *   Delivered → completed (triple-ring hero, picked-up status card, logged-
 *   protein card, "Beställ igen")
 *   Cancelled / Expired → terminal dead states (no lines, exit CTAs)
 *   anything else → terminal fallback (grey check + unknown-status card)
 *
 * Live updates: REST polling every 5s, exactly like the web (KitchenHub
 * SignalR is admin-only — returns 401 to customers — so no socket is
 * attempted). Polling stops in terminal states (completed/cancelled/
 * expired/terminal, web parity). A failed refetch keeps showing the last
 * known order plus the web's fetch-error notice.
 *
 * NOT ported (profile scope, excluded by this feature's instructions): the
 * protein-goal progress card (nutritionProfileApi + dailyMacros
 * accumulation) and the "Smart val"-line tied to it. The completed screen's
 * order-derived "+Xg protein loggat idag" card IS ported (it reads only the
 * order lines). The web's ?stripe=success cart clear is replaced by the
 * pending-stripe-clear flag from Feature 5 (the URL param can't reach the
 * app).
 *
 * Mobile additions (verified fields, no invented copy — documented):
 * "Betalningsmetod"-row in the summary card (ApiOrder.paymentMethod +
 * checkout labels) and the customer's own note text (ApiOrder.customerNote)
 * shown in the summary card. The web page displays neither.
 */

/* ── Status helpers (verbatim web ports) ── */

type CustomerStatus =
  | "awaiting_payment"
  | "created"
  | "inprogress"
  | "ready"
  | "completed"
  | "cancelled"
  | "expired"
  | "terminal";

function toCustomerStatus(s: string): CustomerStatus {
  switch (s.toLowerCase()) {
    case "pendingpayment":
      return "awaiting_payment";
    case "pending":
      return "created";
    case "confirmed":
    case "preparing":
      return "inprogress";
    case "ready":
      return "ready";
    case "delivered":
      return "completed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "terminal";
  }
}

const KITCHEN_STATUSES = ["created", "inprogress", "ready"] as const;
function stepIndex(s: CustomerStatus) {
  return KITCHEN_STATUSES.indexOf(s as (typeof KITCHEN_STATUSES)[number]);
}

function isTerminal(cs: CustomerStatus) {
  return cs === "terminal" || cs === "expired" || cs === "completed" || cs === "cancelled";
}

/** Rough customer-facing wait estimate per state (verbatim web values). */
function estimateWaitMinutes(cs: CustomerStatus): number | null {
  switch (cs) {
    case "created":
      return 12;
    case "inprogress":
      return 5;
    case "ready":
      return null;
    default:
      return null;
  }
}

function sizeLabel(size: string, t: TFunction): string {
  return t(`orderStatus.sizeNames.${size.toLowerCase()}`, { defaultValue: size });
}

/** "idag HH:MM" for same-day orders, "d mmm HH:MM" otherwise (web port). */
function formatPickupTime(iso: string, t: TFunction, language: AppLanguage): string | null {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    const time = formatTime(d, language);
    if (sameDay) return t("orderStatus.dateToday", { time });
    const date = formatDate(d, language, { day: "numeric", month: "short" });
    return `${date} ${time}`;
  } catch {
    return null;
  }
}

/** Countdown to reservedUntil — verbatim port of the web's useCountdown. */
function useCountdown(reservedUntil: string | null | undefined) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!reservedUntil) return;
    const deadline = new Date(reservedUntil).getTime();
    const tick = () => {
      setRemaining(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [reservedUntil]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const label = `${minutes}:${String(seconds).padStart(2, "0")}`;
  const expired = remaining === 0 && !!reservedUntil;
  return { remaining, label, expired };
}

/** Whole-kr rendering used by the web order page (grouping per language). */
function lineKr(ore: number, language: AppLanguage): string {
  return `${formatNumber(Math.round(ore / 100), language)} kr`;
}

/* ── Screen ─────────────────────────────────────────────────── */

export function OrderStatusScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { clearCart } = useCart();

  // REST polling every 5s (web parity); stops in terminal states. A failed
  // background refetch keeps the last known order in cache — that's the
  // web's "show last known status + error notice" behavior.
  const orderQuery = useQuery({
    queryKey: ["orders", id],
    queryFn: () => getOrderById(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && isTerminal(toCustomerStatus(data.status))) return false;
      return 5000;
    },
    retry: (failureCount, error) => {
      const status = (error as unknown as ApiError | undefined)?.status;
      if (status === 401 || status === 404) return false;
      return failureCount < 2;
    },
  });
  const order = orderQuery.data ?? null;
  const fetchError = orderQuery.isError;
  const errorStatus = (orderQuery.error as unknown as ApiError | null)?.status;

  // 401 with no cached order → the session is gone; send to login with a
  // return path (the web's authenticated fetch throws and lands on notFound;
  // on mobile we can do better since we know the status code).
  useEffect(() => {
    if (!order && errorStatus === 401) {
      router.replace({ pathname: "/logga-in", params: { next: `/order/${id}` } });
    }
  }, [order, errorStatus, router, id]);

  // One-time cart clear once the Stripe order this cart started reports Paid
  // (mobile equivalent of the web's one-shot ?stripe=success clear).
  const clearedRef = useRef(false);
  useEffect(() => {
    if (!order || clearedRef.current) return;
    if (order.paymentMethod !== "stripe" || order.paymentStatus?.toLowerCase() !== "paid") return;
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

  if (!order) {
    if (errorStatus === 401) return <View style={styles.root} />;
    return (
      <View style={[styles.root, styles.center, { gap: spacing[3], paddingHorizontal: spacing[6] }]}>
        <AlertCircle size={40} color="#f87171" />
        <ThemedText style={styles.deadTitle}>{t("orderStatus.notFoundTitle")}</ThemedText>
        <Pressable onPress={() => router.navigate("/(tabs)/meny")} accessibilityRole="link">
          <ThemedText style={styles.link}>{t("orderStatus.notFoundCta")}</ThemedText>
        </Pressable>
      </View>
    );
  }

  const cs = toCustomerStatus(order.status);

  if (cs === "created" || cs === "inprogress" || cs === "ready") {
    return <OrderActiveView order={order} fetchError={fetchError} />;
  }
  if (cs === "completed") {
    return <OrderCompletedView order={order} />;
  }
  return <OrderPendingTerminalView order={order} cs={cs} fetchError={fetchError} />;
}

/* ── Shared chrome ──────────────────────────────────────────── */

function StickyHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"))}
        style={styles.headerButton}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
      >
        <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
      </Pressable>
      <ThemedText style={styles.wordmark}>NUTRI</ThemedText>
      <View style={{ width: 36 }} />
    </View>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <ThemedText style={styles.sectionHead}>{children}</ThemedText>;
}

/** Pulsing status dot (web's vbPulse/pulseDot keyframes). */
function PulsingDot({ size = 6, style }: { size?: number; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withRepeat(withTiming(0.4, { duration: 1000 }), -1, true);
  }, [reduced, opacity]);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent },
        animStyle,
        style,
      ]}
    />
  );
}

/** Horizontal 3-step progress (web Variation B stepper). curStep: -1 = none,
 * steps.length = all done. */
function ProgressSteps({ labels, curStep }: { labels: string[]; curStep: number }) {
  return (
    <View style={styles.stepsRow}>
      {labels.map((label, i) => {
        const done = i < curStep;
        const current = i === curStep;
        const isLast = i === labels.length - 1;
        return (
          <View key={label} style={styles.stepCol}>
            {!isLast && (
              <View
                style={[
                  styles.stepLine,
                  { backgroundColor: done ? colors.accent : "rgba(255,255,255,0.1)" },
                ]}
              />
            )}
            <View
              style={[
                styles.stepDot,
                done && { backgroundColor: colors.accent, borderColor: colors.accent },
                current && {
                  backgroundColor: "rgba(232,101,10,0.12)",
                  borderColor: colors.accent,
                },
              ]}
            >
              {done ? (
                <Check size={10} color={colors.textPrimary} strokeWidth={2.5} />
              ) : current ? (
                <View style={styles.stepDotInner} />
              ) : null}
            </View>
            <ThemedText
              style={[
                styles.stepLabel,
                current && { color: colors.accent, fontFamily: fontFamily.bodySemibold },
                done && { color: "rgba(255,255,255,0.45)" },
              ]}
            >
              {label}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

/** Order-lines card (web Variation B summary): title + size, qty×, whole-kr
 * price, total row — plus the mobile additions (customer note, payment
 * method) built from verified ApiOrder fields and existing checkout copy. */
function OrderLinesCard({ order }: { order: ApiOrder }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const paymentMethodLabel =
    order.paymentMethod === "stripe"
      ? t("checkout.payOnline")
      : order.paymentMethod === "pay_on_site"
        ? t("checkout.payAtPickup")
        : (order.paymentMethod ?? null);
  return (
    <View style={styles.card}>
      {order.lines.map((line, i) => (
        <View
          key={line.id}
          style={[styles.lineRow, i < order.lines.length - 1 && styles.rowBorder]}
        >
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.lineTitle}>{line.titleSnapshot}</ThemedText>
            {line.size && line.size !== "Normal" ? (
              <ThemedText style={styles.lineSize}>{sizeLabel(line.size, t)}</ThemedText>
            ) : null}
          </View>
          <ThemedText style={styles.lineQty}>{line.quantity}×</ThemedText>
          <ThemedText style={styles.linePrice}>{lineKr(line.lineTotalOre, language)}</ThemedText>
        </View>
      ))}
      {order.customerNote ? (
        <View style={[styles.lineRow, { borderTopWidth: 1, borderTopColor: colors.borderSoft }]}>
          <ThemedText style={styles.noteText}>”{order.customerNote}”</ThemedText>
        </View>
      ) : null}
      {paymentMethodLabel ? (
        <View style={[styles.lineRow, { borderTopWidth: 1, borderTopColor: colors.borderSoft }]}>
          <ThemedText style={styles.paymentMethodLabel}>{t("checkout.paymentHeading")}</ThemedText>
          <ThemedText style={styles.paymentMethodValue}>{paymentMethodLabel}</ThemedText>
        </View>
      ) : null}
      {/* Coupon/POS discount — subtotal + discount rows explain why Totalt
       * differs from the line sum. ApiOrder.discountAmountOre/discountPercent
       * are the backend's authoritative values. */}
      {(order.discountAmountOre ?? 0) > 0 ? (
        <>
          <View style={[styles.lineRow, { borderTopWidth: 1, borderTopColor: colors.borderSoft }]}>
            <ThemedText style={styles.paymentMethodLabel}>{t("coupon.orderSubtotal")}</ThemedText>
            <ThemedText style={styles.paymentMethodValue}>{lineKr(order.subtotalOre, language)}</ThemedText>
          </View>
          <View style={styles.lineRow}>
            <ThemedText style={styles.paymentMethodLabel}>
              {order.discountPercent
                ? t("coupon.orderDiscountRowPct", { pct: order.discountPercent })
                : t("coupon.orderDiscountRowPlain")}
            </ThemedText>
            <ThemedText style={styles.discountValue}>
              −{lineKr(order.discountAmountOre ?? 0, language)}
            </ThemedText>
          </View>
        </>
      ) : null}
      <View style={styles.totalRow}>
        <ThemedText style={styles.totalLabel}>{t("orderStatus.total")}</ThemedText>
        <ThemedText style={styles.totalValue}>{lineKr(order.totalOre, language)}</ThemedText>
      </View>
    </View>
  );
}

function ConfirmationSentText({ email }: { email: string }) {
  const { t } = useTranslation();
  return (
    <ThemedText style={styles.confirmationSent}>
      {t("orderStatus.confirmationSent", { email })}
    </ThemedText>
  );
}

function FetchErrorNotice({ long }: { long?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.fetchErrorBox}>
      <AlertCircle size={14} color="#f87171" />
      <ThemedText style={styles.fetchErrorText}>
        {long ? t("orderStatus.fetchErrorLong") : t("orderStatus.fetchErrorShort")}
      </ThemedText>
    </View>
  );
}

/* ── Active kitchen flow (web OrderActiveVariationB) ────────── */

function OrderActiveView({ order, fetchError }: { order: ApiOrder; fetchError: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cs = toCustomerStatus(order.status);
  const curStep = stepIndex(cs);
  const stepLabels = [t("orderStatus.stepReceived"), t("orderStatus.stepPreparing"), t("orderStatus.stepReadyPickup")];
  const statusLabel = curStep >= 0 && curStep < stepLabels.length ? stepLabels[curStep] : t("orderStatus.stepReceived");
  const waitMin = estimateWaitMinutes(cs);

  return (
    <View style={styles.root}>
      <StickyHeader />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroRingOuter}>
            <View style={styles.heroRingInner}>
              <Check size={16} color={colors.textPrimary} strokeWidth={2.5} />
            </View>
          </View>
          <ThemedText style={styles.heroTitle}>{t("orderStatus.activeTitle")}</ThemedText>
          <ThemedText style={styles.heroSub}>
            {t("orderStatus.activeWaitLabel")}{" "}
            <ThemedText style={styles.heroSubStrong}>
              {waitMin !== null
                ? t("orderStatus.activeWaitMinutes", { minutes: waitMin })
                : t("orderStatus.activeReadyToPickup")}
            </ThemedText>
          </ThemedText>
          <ThemedText style={styles.heroNumberLabel}>{t("orderStatus.orderNumber").toUpperCase()}</ThemedText>
          <ThemedText style={styles.heroNumber}>#{order.orderNumber}</ThemedText>
        </View>

        <View style={styles.body}>
          {/* Status card */}
          <SectionHead>{t("orderStatus.sectionStatus").toUpperCase()}</SectionHead>
          <View style={styles.card}>
            <View style={[styles.statusRow, styles.rowBorder]}>
              <View style={styles.statusPill}>
                <PulsingDot />
                <ThemedText style={styles.statusPillText}>{statusLabel}</ThemedText>
              </View>
              <ThemedText style={styles.statusRight}>
                {waitMin !== null ? (
                  <>
                    <ThemedText style={styles.statusRightStrong}>{waitMin} min</ThemedText>{" "}
                    {t("orderStatus.activeRemaining")}
                  </>
                ) : (
                  <ThemedText style={styles.statusRightStrong}>{t("orderStatus.activeReadyNow")}</ThemedText>
                )}
              </ThemedText>
            </View>
            <View style={styles.stepsWrap}>
              <ProgressSteps labels={stepLabels} curStep={curStep} />
            </View>
          </View>

          {/* Order summary */}
          <SectionHead>{t("orderStatus.sectionOrderSummary").toUpperCase()}</SectionHead>
          <OrderLinesCard order={order} />

          {/* Pickup info */}
          <SectionHead>{t("orderStatus.sectionPickup").toUpperCase()}</SectionHead>
          <View style={[styles.card, styles.pickupCard]}>
            <View style={styles.pickupIcon}>
              <Lock size={16} color="rgba(255,255,255,0.5)" strokeWidth={1.4} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.pickupTitle}>{t("orderStatus.pickupTitle")}</ThemedText>
              <ThemedText style={styles.pickupBody}>{t("orderStatus.pickupBody")}</ThemedText>
              <ThemedText style={styles.pickupNumber}>#{order.orderNumber}</ThemedText>
            </View>
          </View>

          <ConfirmationSentText email={order.customerEmail} />
          {fetchError && <FetchErrorNotice long />}
        </View>
      </ScrollView>

      {/* Sticky bottom CTA — secondary "Till menyn" */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing[3] }]}>
        <Pressable
          onPress={() => router.navigate("/(tabs)/meny")}
          style={({ pressed }) => [
            styles.secondaryCta,
            pressed && { backgroundColor: "rgba(255,255,255,0.1)" },
          ]}
          accessibilityRole="button"
        >
          <Menu size={14} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
          <ThemedText style={styles.secondaryCtaText}>{t("orderStatus.toMenu")}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

/* ── Completed / picked-up (web OrderCompletedVariationB) ───── */

function OrderCompletedView({ order }: { order: ApiOrder }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const orderProtein = order.lines.reduce(
    (s, l) => s + (l.proteinG || l.macros?.proteinG || 0) * l.quantity,
    0
  );
  const pickupTime = formatPickupTime(order.createdAt, t, language);
  const stepLabels = [t("orderStatus.stepReceived"), t("orderStatus.stepPreparing"), t("orderStatus.stepPickedUp")];

  return (
    <View style={styles.root}>
      <StickyHeader />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        {/* Hero — triple-ring check */}
        <View style={styles.hero}>
          <View style={styles.completedRing1}>
            <View style={styles.completedRing2}>
              <View style={styles.completedRing3}>
                <Check size={14} color={colors.textPrimary} strokeWidth={2.5} />
              </View>
            </View>
          </View>
          <ThemedText style={styles.heroTitle}>{t("orderStatus.completedTitle")}</ThemedText>
          <ThemedText style={styles.heroSub}>{t("orderStatus.completedBody", { number: order.orderNumber })}</ThemedText>
          <View style={styles.completedNumberRow}>
            <ThemedText style={styles.heroNumberLabel}>{t("orderStatus.sectionOrder").toUpperCase()}</ThemedText>
            <ThemedText style={styles.completedNumber}>#{order.orderNumber}</ThemedText>
          </View>
          {pickupTime ? <ThemedText style={styles.completedTime}>{pickupTime}</ThemedText> : null}
        </View>

        <View style={styles.body}>
          {/* Status card — all done, no pulse */}
          <SectionHead>{t("orderStatus.sectionStatus").toUpperCase()}</SectionHead>
          <View style={styles.card}>
            <View style={[styles.statusRow, styles.rowBorder]}>
              <View style={styles.pickedUpPill}>
                <View style={styles.pickedUpCheck}>
                  <Check size={8} color={colors.textPrimary} strokeWidth={3} />
                </View>
                <ThemedText style={styles.pickedUpPillText}>{t("orderStatus.stepPickedUp")}</ThemedText>
              </View>
              {pickupTime ? (
                <ThemedText style={styles.statusRight}>{pickupTime}</ThemedText>
              ) : null}
            </View>
            <View style={styles.stepsWrap}>
              <ProgressSteps labels={stepLabels} curStep={stepLabels.length} />
            </View>
          </View>

          {/* Compact protein logged (order-derived, web parity) */}
          {orderProtein > 0 && (
            <>
              <SectionHead>{t("orderStatus.sectionLogged").toUpperCase()}</SectionHead>
              <View style={[styles.card, styles.loggedCard]}>
                <View style={styles.loggedLeft}>
                  <ThemedText style={styles.loggedValue}>+{orderProtein}g</ThemedText>
                  <ThemedText style={styles.loggedText}>{t("orderStatus.proteinLoggedToday")}</ThemedText>
                </View>
                <View style={styles.loggedBadge}>
                  <ThemedText style={styles.loggedBadgeText}>
                    {t("orderStatus.loggedBadge").toUpperCase()}
                  </ThemedText>
                </View>
              </View>
            </>
          )}

          {/* Order summary */}
          <SectionHead>{t("orderStatus.sectionOrder").toUpperCase()}</SectionHead>
          <OrderLinesCard order={order} />

          <ConfirmationSentText email={order.customerEmail} />
        </View>
      </ScrollView>

      {/* Sticky bottom CTA — primary "Beställ igen" */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing[3] }]}>
        <Pressable
          onPress={() => router.navigate("/(tabs)/meny")}
          style={({ pressed }) => [
            styles.primaryCta,
            pressed && { backgroundColor: colors.accentHover },
          ]}
          accessibilityRole="button"
        >
          <ThemedText style={styles.primaryCtaText}>{t("orderStatus.orderAgain")}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

/* ── Pending / expired / cancelled / terminal (web main render) ── */

function OrderPendingTerminalView({
  order,
  cs,
  fetchError,
}: {
  order: ApiOrder;
  cs: CustomerStatus;
  fetchError: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { label: countdownLabel, expired: countdownExpired } = useCountdown(order.reservedUntil);

  const isStripeOnline = order.paymentMethod === "stripe";
  const isPending = cs === "awaiting_payment";
  const isExpired = cs === "expired";
  const isCancelled = cs === "cancelled";

  return (
    <View style={styles.root}>
      <StickyHeader />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing[4],
          paddingTop: spacing[6],
          paddingBottom: insets.bottom + spacing[10],
        }}
      >
        {isExpired ? (
          /* ── EXPIRED ── */
          <>
            <View style={styles.deadIconWrap}>
              <AlertCircle size={26} color="#f87171" />
            </View>
            <ThemedText style={styles.deadTitle}>{t("orderStatus.expiredTitle")}</ThemedText>
            <ThemedText style={styles.deadBody}>{t("orderStatus.expiredBody")}</ThemedText>
            <View style={styles.deadActions}>
              <Pressable
                onPress={() => router.navigate("/(tabs)/meny")}
                style={({ pressed }) => [
                  styles.primaryCta,
                  pressed && { backgroundColor: colors.accentHover },
                ]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.primaryCtaText}>{t("orderStatus.expiredNewOrder")}</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => router.navigate("/(tabs)")}
                style={({ pressed }) => [
                  styles.secondaryCta,
                  pressed && { backgroundColor: "rgba(255,255,255,0.1)" },
                ]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.secondaryCtaText}>{t("orderStatus.expiredHome")}</ThemedText>
              </Pressable>
            </View>
          </>
        ) : isCancelled ? (
          /* ── CANCELLED ── */
          <>
            <View style={styles.deadIconWrap}>
              <AlertCircle size={26} color="#888888" />
            </View>
            <ThemedText style={styles.deadTitle}>{t("orderStatus.cancelledTitle")}</ThemedText>
            <ThemedText style={styles.deadBody}>{t("orderStatus.cancelledBody")}</ThemedText>
            <View style={styles.deadActions}>
              <Pressable
                onPress={() => router.navigate("/(tabs)/meny")}
                style={({ pressed }) => [
                  styles.primaryCta,
                  pressed && { backgroundColor: colors.accentHover },
                ]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.primaryCtaText}>{t("orderStatus.toMenu")}</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => router.navigate("/(tabs)")}
                style={({ pressed }) => [
                  styles.secondaryCta,
                  pressed && { backgroundColor: "rgba(255,255,255,0.1)" },
                ]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.secondaryCtaText}>{t("orderStatus.expiredHome")}</ThemedText>
              </Pressable>
            </View>
          </>
        ) : isPending && isStripeOnline ? (
          /* ── STRIPE ONLINE PAYMENT PENDING ── */
          <>
            <View style={styles.pendingIconWrap}>
              <Clock size={24} color={colors.accent} strokeWidth={2} />
            </View>
            <ThemedText style={styles.deadTitle}>{t("orderStatus.stripePendingTitle")}</ThemedText>
            <ThemedText style={styles.deadBody}>{t("orderStatus.stripePendingBody")}</ThemedText>
            <View style={styles.numberBlock}>
              <ThemedText style={styles.heroNumberLabel}>
                {t("orderStatus.orderNumber").toUpperCase()}
              </ThemedText>
              <ThemedText style={styles.bigNumber}>#{order.orderNumber}</ThemedText>
            </View>
            <CountdownCard
              expired={countdownExpired}
              label={countdownLabel}
              sublabel={t("orderStatus.stripePendingReservation")}
            />
            {fetchError && <FetchErrorNotice />}
          </>
        ) : isPending ? (
          /* ── PAY AT COUNTER ── */
          <>
            <View style={styles.pendingIconWrap}>
              <CreditCard size={24} color={colors.accent} strokeWidth={2} />
            </View>
            <View style={styles.numberBlock}>
              <ThemedText style={styles.heroNumberLabel}>
                {t("orderStatus.orderNumber").toUpperCase()}
              </ThemedText>
              <ThemedText style={styles.hugeNumber}>#{order.orderNumber}</ThemedText>
              <ThemedText style={styles.numberHint}>{t("orderStatus.showNumber")}</ThemedText>
            </View>
            <CountdownCard
              expired={countdownExpired}
              label={countdownLabel}
              sublabel={t("orderStatus.countdownLeft")}
            />
            {/* Vertical pay stepper — first step always active while pending */}
            <View style={[styles.card, styles.payStepper]}>
              {[t("orderStatus.payStepAwaiting"), t("orderStatus.payStepPreparing"), t("orderStatus.payStepReady")].map(
                (label, i, arr) => {
                  const isActive = i === 0;
                  const isLast = i === arr.length - 1;
                  return (
                    <View key={label} style={styles.payStepRow}>
                      <View style={styles.payStepRail}>
                        <View
                          style={[
                            styles.payStepDot,
                            isActive && { backgroundColor: colors.accent },
                          ]}
                        >
                          {isActive ? (
                            <PulsingDot size={8} />
                          ) : (
                            <View style={styles.payStepDotInner} />
                          )}
                        </View>
                        {!isLast && <View style={styles.payStepLine} />}
                      </View>
                      <ThemedText
                        style={[styles.payStepLabel, isActive && styles.payStepLabelActive]}
                      >
                        {label}
                      </ThemedText>
                    </View>
                  );
                }
              )}
            </View>
            {fetchError && <FetchErrorNotice />}
          </>
        ) : (
          /* ── TERMINAL / UNKNOWN STATUS FALLBACK ── */
          <>
            <View style={styles.deadIconWrap}>
              <Check size={26} color="#666666" strokeWidth={2.5} />
            </View>
            <View style={styles.numberBlock}>
              <ThemedText style={styles.heroNumberLabel}>
                {t("orderStatus.orderNumber").toUpperCase()}
              </ThemedText>
              <ThemedText style={styles.bigNumber}>#{order.orderNumber}</ThemedText>
            </View>
            <View style={[styles.card, { padding: spacing[4] }]}>
              <View style={styles.statusPill}>
                <PulsingDot />
                <ThemedText style={styles.statusPillText}>{t("orderStatus.statusUnknown")}</ThemedText>
              </View>
              <View style={{ marginTop: spacing[4], flexDirection: "row", gap: spacing[2] }}>
                {[
                  { label: t("orderStatus.stepReceived"), Icon: ShoppingBag },
                  { label: t("orderStatus.stepPreparing"), Icon: ChefHat },
                  { label: t("orderStatus.stepPickup"), Icon: Check },
                ].map(({ label, Icon }) => (
                  <View key={label} style={styles.terminalStep}>
                    <View style={styles.terminalStepIcon}>
                      <Icon size={14} color="#444444" />
                    </View>
                    <ThemedText style={styles.terminalStepLabel}>{label}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
            {fetchError && <FetchErrorNotice long />}
          </>
        )}

        {/* Order lines — hidden for dead states (web parity) */}
        {!isExpired && !isCancelled && (
          <>
            <ThemedText style={[styles.sectionHead, { marginTop: spacing[4] }]}>
              {t("orderStatus.orderDetails").toUpperCase()}
            </ThemedText>
            <OrderLinesCard order={order} />
            <ConfirmationSentText email={order.customerEmail} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CountdownCard({
  expired,
  label,
  sublabel,
}: {
  expired: boolean;
  label: string;
  sublabel: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.card, styles.countdownCard]}>
      {expired ? (
        <ThemedText style={styles.countdownExpired}>{t("orderStatus.countdownExpired")}</ThemedText>
      ) : (
        <>
          <ThemedText style={styles.countdownValue}>{label}</ThemedText>
          <ThemedText style={styles.countdownSub}>{sublabel}</ThemedText>
        </>
      )}
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────── */

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
  sectionHead: {
    marginHorizontal: spacing[1],
    marginTop: spacing[3],
    marginBottom: spacing[2],
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    color: colors.textMuted,
  },
  body: { paddingHorizontal: spacing[4], gap: spacing[1] },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },

  /* Hero (active + completed) */
  hero: { alignItems: "center", paddingHorizontal: spacing[6], paddingTop: spacing[6], paddingBottom: spacing[4] },
  heroRingOuter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(232,101,10,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(232,101,10,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[3],
  },
  heroRingInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 18,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.4,
    color: colors.textPrimary,
    marginBottom: 5,
  },
  heroSub: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 260,
    color: "rgba(255,255,255,0.35)",
  },
  heroSubStrong: { fontSize: 13, fontFamily: fontFamily.bodySemibold, color: "rgba(255,255,255,0.65)" },
  heroNumberLabel: {
    marginTop: spacing[4],
    fontSize: 9,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 2,
    color: colors.textMuted,
  },
  heroNumber: {
    marginTop: 2,
    fontSize: 28,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -1,
    color: colors.textPrimary,
  },

  /* Status card */
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(232,101,10,0.12)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.25)",
    borderRadius: 20,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 10,
  },
  statusPillText: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  statusRight: { fontSize: 12, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.4)" },
  statusRightStrong: {
    fontSize: 12,
    fontFamily: fontFamily.monoMedium,
    color: "rgba(255,255,255,0.75)",
  },
  stepsWrap: { paddingHorizontal: spacing[4], paddingTop: spacing[4], paddingBottom: spacing[3] },
  stepsRow: { flexDirection: "row", alignItems: "flex-start" },
  stepCol: { flex: 1, alignItems: "center" },
  stepLine: {
    position: "absolute",
    top: 10,
    left: "50%",
    right: "-50%",
    height: 1.5,
    zIndex: 0,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  stepDotInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  stepLabel: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 9.5,
    lineHeight: 12,
    letterSpacing: 0.2,
    fontFamily: fontFamily.bodyMedium,
    color: "rgba(255,255,255,0.28)",
  },

  /* Lines card */
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  lineTitle: { fontSize: 13.5, fontFamily: fontFamily.bodyMedium, color: colors.textPrimary },
  lineSize: { marginTop: 2, fontSize: 11, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.3)" },
  lineQty: { fontSize: 12, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.3)" },
  linePrice: {
    fontSize: 13.5,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  noteText: { flex: 1, fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.45)" },
  paymentMethodLabel: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.4)" },
  paymentMethodValue: { fontSize: 12.5, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.7)" },
  discountValue: { fontSize: 12.5, fontFamily: fontFamily.bodyMedium, color: "#4ade80" },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  totalLabel: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  totalValue: {
    fontSize: 16,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },

  /* Pickup card */
  pickupCard: { flexDirection: "row", gap: spacing[3], padding: spacing[4] },
  pickupIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickupTitle: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  pickupBody: { marginTop: 3, fontSize: 12, lineHeight: 17, color: "rgba(255,255,255,0.35)" },
  pickupNumber: {
    marginTop: 6,
    fontSize: 14,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 0.5,
    color: colors.accent,
  },

  /* Completed hero */
  completedRing1: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[3],
  },
  completedRing2: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(232,101,10,0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(232,101,10,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  completedRing3: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  completedNumberRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: spacing[2] },
  completedNumber: {
    fontSize: 26,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -1,
    color: colors.textPrimary,
  },
  completedTime: { marginTop: spacing[2], fontSize: 11, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.2)" },
  pickedUpPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  pickedUpCheck: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(232,101,10,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickedUpPillText: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: "rgba(255,255,255,0.65)" },

  /* Logged protein */
  loggedCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  loggedLeft: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  loggedValue: {
    fontSize: 18,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.5,
    color: colors.accent,
  },
  loggedText: { fontSize: 12, color: "rgba(255,255,255,0.35)" },
  loggedBadge: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  loggedBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.45)",
  },

  /* Pending / dead states */
  deadIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing[5],
  },
  pendingIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(232,101,10,0.12)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing[5],
  },
  deadTitle: {
    textAlign: "center",
    fontSize: 20,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
  },
  deadBody: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    color: "#666666",
  },
  deadActions: { marginTop: spacing[6], gap: spacing[3] },
  link: { fontSize: 14, color: colors.accent },
  numberBlock: { alignItems: "center", marginTop: spacing[4], marginBottom: spacing[4] },
  bigNumber: {
    marginTop: 2,
    fontSize: 48,
    fontFamily: fontFamily.monoMedium,
    lineHeight: 56,
    color: colors.textPrimary,
  },
  hugeNumber: {
    marginTop: 2,
    fontSize: 64,
    fontFamily: fontFamily.monoMedium,
    lineHeight: 72,
    letterSpacing: -1,
    color: colors.textPrimary,
  },
  numberHint: { marginTop: 4, fontSize: 14, color: "#888888" },

  /* Countdown */
  countdownCard: { alignItems: "center", paddingVertical: spacing[4], paddingHorizontal: spacing[4], marginBottom: spacing[3] },
  countdownValue: {
    fontSize: 28,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  countdownSub: { marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.33)" },
  countdownExpired: { fontSize: 14, color: "#f87171" },

  /* Vertical pay stepper */
  payStepper: { padding: spacing[4] },
  payStepRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  payStepRail: { alignItems: "center" },
  payStepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#242424",
    alignItems: "center",
    justifyContent: "center",
  },
  payStepDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#444444" },
  payStepLine: { width: 1, height: 28, backgroundColor: "#242424", marginVertical: 3 },
  payStepLabel: { paddingTop: 3, fontSize: 14, color: "#444444" },
  payStepLabelActive: { fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },

  /* Terminal fallback stepper */
  terminalStep: { flex: 1, alignItems: "center", gap: 6 },
  terminalStepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  terminalStepLabel: { fontSize: 10, color: "#444444" },

  /* Fetch error + footer */
  fetchErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginTop: spacing[3],
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.1)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  fetchErrorText: { flex: 1, fontSize: 12.5, color: "#f87171" },
  confirmationSent: {
    marginTop: spacing[4],
    textAlign: "center",
    fontSize: 11.5,
    lineHeight: 17,
    color: "rgba(255,255,255,0.2)",
  },

  /* Bottom CTAs */
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    backgroundColor: "rgba(17,17,17,0.96)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryCta: {
    height: 48,
    borderRadius: 11,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  primaryCtaText: { fontSize: 14, fontFamily: fontFamily.bodyBold, color: colors.textPrimary, letterSpacing: 0.1 },
  secondaryCta: {
    height: 48,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  secondaryCtaText: {
    fontSize: 14,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
    letterSpacing: 0.1,
  },
});
