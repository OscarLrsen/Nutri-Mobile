import { useEffect, useState, type ReactNode } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import {
  AlertTriangle,
  BadgePercent,
  ChevronRight,
  CreditCard,
  Info,
  Menu,
  Minus,
  Plus,
  ShoppingBag,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { useCart } from "@/context/CartContext";
import { useCoupon } from "@/context/CouponContext";
import { useAuth } from "@/services/auth/AuthProvider";
import { getStoreStatus } from "@/services/api/store";
import { createOrder, createCheckoutSession } from "@/services/api/orders";
import { getMyCoupons, isCouponUsable, type ApiCoupon } from "@/services/api/coupons";
import type { CartItem } from "@/types/cart";
import { CUSTOMER_SIZE_OPTIONS, MEAL_SIZES, previewMealPriceOre } from "@/utils/pricing";
import { formatPriceKr, krToOre } from "@/utils/money";
import { applyDiscountPreview } from "@/utils/discountMath";
import { normalizeMacroSnapshot } from "@/utils/macroMath";
import {
  formatOrderError,
  isActiveReservationErr,
  isCouponRejectedError,
  isStockOutError,
} from "@/utils/orderErrors";
import { setActiveOrderId, getActiveOrderId, setPendingStripeClear } from "@/utils/activeOrder";
import { env } from "@/lib/env";
import { authCopy, cartCopy as copy, checkoutCopy, couponCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Cart + checkout — port of the web src/app/varukorg/page.tsx. On the web the
 * cart page IS the checkout (item list, customer note, payment methods, and
 * the reserve/pay CTA all live on one page); the mobile screen keeps that
 * exact structure rather than inventing a separate checkout step.
 *
 * Ported behavior: fixed-vs-custom line pricing, closed/paused gating (with
 * the web's fetch-failure-counts-as-closed derivation), drinks-only carts
 * blocked from online payment, unavailable-item block, 409 handling (active
 * reservation / out of stock / just closed), login gate with return-to-cart,
 * ACTIVE_ORDER_KEY persistence before navigation, and the exact CTA label
 * state machine.
 *
 * Stripe adaptation (documented): the web does window.location.assign(url);
 * mobile opens the Checkout URL in the system browser (expo-web-browser).
 * The session's success/cancel URLs point at the WEB app, so after paying,
 * the browser shows the web order page; closing it returns here, where we
 * navigate to the in-app order screen. The cart is NOT cleared before or
 * during Stripe checkout (web parity) — the order screen clears it once the
 * webhook has marked the order Paid (mobile equivalent of ?stripe=success).
 *
 * NOT ported (web-only or later features): Stripe cancel-return banner
 * (?stripe=cancel can't reach the app), log-to-profile section (profile
 * feature), drink upsell section.
 */

const SIZE_LABEL_SHORT: Record<string, string> = {
  small: "S",
  medium: "M",
  large: "L",
};

type PaymentMethod = "pay_on_site" | "stripe";

export function CartScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, hydrated, clearCart, subtotalOre, totalOre } = useCart();
  const { selectedCoupon, clearSelectedCoupon } = useCoupon();
  const { user, loading: authLoading } = useAuth();

  const authEmail = user?.email ?? null;
  const authName = (user?.user_metadata?.full_name as string | undefined) || authCopy.guest;
  const userLoaded = !authLoading;

  /* ── Coupon (preview only — the backend recomputes authoritatively) ── */

  // The user's coupons: powers the "Använd en kupong" affordance and keeps a
  // stale selection honest (used from another device, expired overnight).
  const couponsQuery = useQuery({
    queryKey: ["coupons", user?.id ?? null],
    queryFn: getMyCoupons,
    enabled: !!user,
  });
  const usableCoupons = (couponsQuery.data ?? []).filter(isCouponUsable);

  // Reconcile the persisted selection against fresh backend data. Deselect
  // ONLY when the backend explicitly reports the coupon as no longer usable
  // (status Used/Expired, or its expiresAt has passed) — that is real
  // server-side truth, e.g. the coupon was consumed by an order whose
  // response we lost. A coupon MISSING from the list is deliberately left
  // selected: an empty/partial list is not an explicit used/expired signal,
  // and if the coupon truly is invalid the order attempt will come back
  // with the exact rejection message, which is handled below. Failed
  // fetches (network down) never reach this — isSuccess gates it.
  useEffect(() => {
    if (!selectedCoupon || !couponsQuery.isSuccess) return;
    const fresh = couponsQuery.data.find((c) => c.id === selectedCoupon.id);
    if (fresh && !isCouponUsable(fresh)) clearSelectedCoupon();
  }, [selectedCoupon, couponsQuery.isSuccess, couponsQuery.data, clearSelectedCoupon]);

  // A coupon only rides along when the order will carry a JWT sub claim —
  // the backend 401s couponId without one, and ordering is login-gated anyway.
  const appliedCoupon = selectedCoupon && user && isCouponUsable(selectedCoupon) ? selectedCoupon : null;
  const discountPreview = appliedCoupon
    ? applyDiscountPreview(subtotalOre, appliedCoupon.percentage)
    : null;
  // Without a coupon the cart total stays exactly the pre-coupon behavior.
  const effectiveTotalOre = discountPreview ? discountPreview.totalOre : totalOre;

  // Same 30s store-status poll as the web's StoreStatusProvider; same
  // derivation — a settled fetch with no data counts as closed.
  const storeStatusQuery = useQuery({
    queryKey: ["store", "status"],
    queryFn: getStoreStatus,
    refetchInterval: 30_000,
  });
  const storeStatus = storeStatusQuery.data ?? null;
  const statusSettled = !storeStatusQuery.isLoading;
  const isClosed = storeStatus?.status === "Closed" || (statusSettled && storeStatus === null);
  const isPaused = storeStatus?.status === "Paused";

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pay_on_site");
  const [customerNote, setCustomerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 409 stock error → CTA disabled until the cart contents change (web parity).
  const [stockBlocked, setStockBlocked] = useState(false);
  const [activeReservationError, setActiveReservationError] = useState(false);
  const [activeOrderIdFromError, setActiveOrderIdFromError] = useState<string | null>(null);

  const hasUnavailableItems = items.some((item) => item.meal.available === false);
  // Drinks-only carts cannot pay online (web product gate).
  const isDrinksOnly = items.length > 0 && items.every((i) => i.kind === "drink");

  // Clear the stock-block when cart contents change (web parity).
  useEffect(() => {
    setStockBlocked(false);
  }, [items]);

  // If the cart becomes drinks-only while Stripe is selected, fall back (web parity).
  useEffect(() => {
    if (isDrinksOnly && paymentMethod === "stripe") setPaymentMethod("pay_on_site");
  }, [isDrinksOnly, paymentMethod]);

  /* ── Order placement (port of the web handleSubmit) ── */

  const goToLogin = () =>
    router.push({ pathname: "/logga-in", params: { next: "/(tabs)/varukorg" } });

  const handleSubmit = async () => {
    if (submitting || isClosed || isPaused || !userLoaded || hasUnavailableItems || stockBlocked)
      return;
    if (!authEmail) {
      goToLogin();
      return;
    }
    setError(null);
    setStockBlocked(false);
    setActiveReservationError(false);
    setActiveOrderIdFromError(null);
    setSubmitting(true);
    // Defense-in-depth: never start Stripe for a drinks-only cart (web parity).
    const effectivePaymentMethod: PaymentMethod = isDrinksOnly ? "pay_on_site" : paymentMethod;
    try {
      const order = await createOrder({
        customerName: authName,
        customerEmail: authEmail,
        paymentMethod: effectivePaymentMethod,
        customerNote: customerNote.trim() || undefined,
        couponId: appliedCoupon?.id,
        items: items.map((item) => {
          if (item.kind === "drink" && item.drink) {
            return { mealId: item.drink.id, size: "medium", quantity: item.quantity };
          }
          return {
            mealId: item.isCustom ? null : item.meal.id,
            size: item.sizeId,
            quantity: item.quantity,
            isTailored: item.isCustom,
            customMacros: item.customMacros,
            customIngredients: item.customIngredients,
            containerTypeId: item.containerTypeId,
            originalMealName: item.originalMealName,
          };
        }),
      });

      // The coupon was consumed server-side in the same transaction that
      // created the order (even for Stripe, where payment comes later) —
      // clear the selection and refresh the list so it renders as Använd.
      if (appliedCoupon) {
        clearSelectedCoupon();
        queryClient.invalidateQueries({ queryKey: ["coupons"] }).catch(() => {});
      }

      if (effectivePaymentMethod === "stripe") {
        // Persist the active order BEFORE the session call so a failure never
        // loses the order (web parity).
        await setActiveOrderId(order.id);
        let checkoutUrl: string;
        try {
          const session = await createCheckoutSession(order.id);
          if (!session?.url) throw new Error("Checkout session saknar url.");
          checkoutUrl = session.url;
        } catch {
          // Order exists and is saved; cart is preserved — surface a clear
          // error and STAY in the cart (web parity).
          setError(checkoutCopy.errorStripeStartFailed);
          return;
        }
        // Mark this order for the one-time cart clear once it reports Paid
        // (mobile equivalent of the web's ?stripe=success clear).
        await setPendingStripeClear(order.id);
        // Open Stripe Checkout in the system browser. Cart is NOT cleared —
        // if the customer cancels or backs out it must survive (web parity).
        await WebBrowser.openBrowserAsync(checkoutUrl);
        // Browser dismissed (paid, cancelled, or closed) — show the in-app
        // order screen, which reflects whatever the webhook decided.
        router.push(`/order/${order.id}`);
        return;
      }

      // pay_on_site — unchanged behavior (web parity).
      clearCart();
      await setActiveOrderId(order.id);
      router.push(`/order/${order.id}`);
    } catch (err) {
      if (isActiveReservationErr(err)) {
        setActiveReservationError(true);
        setActiveOrderIdFromError(await getActiveOrderId());
      } else if (isCouponRejectedError(err)) {
        // Backend refused the coupon (used/expired/invalid) — no order was
        // created. Deselect it, refresh the list and surface the backend's
        // own message plus what just happened to the selection.
        clearSelectedCoupon();
        queryClient.invalidateQueries({ queryKey: ["coupons"] }).catch(() => {});
        const { message } = formatOrderError(err);
        setError(`${message ?? checkoutCopy.errorGeneric} ${couponCopy.rejectedSuffix}`);
      } else {
        const { message, unauthorized } = formatOrderError(err);
        if (unauthorized) {
          goToLogin();
        } else if (message) {
          setError(message);
        }
        if (isStockOutError(err)) setStockBlocked(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ── CTA label state machine (web parity) ── */

  const amountStr = formatPriceKr(effectiveTotalOre).replace(" kr", "");
  const ctaLabel = isClosed
    ? (formatNextOpen(storeStatus?.nextOpenAtUtc) ?? checkoutCopy.closedNow)
    : isPaused
      ? checkoutCopy.pausedNow
      : !userLoaded
        ? checkoutCopy.loading
        : hasUnavailableItems || stockBlocked
          ? checkoutCopy.ctaCannotReserve
          : !authEmail
            ? checkoutCopy.ctaLoginToReserve
            : paymentMethod === "stripe"
              ? checkoutCopy.ctaPayOnline(amountStr)
              : checkoutCopy.ctaReserve(amountStr);
  const ctaMuted = isClosed || isPaused || hasUnavailableItems || stockBlocked;
  const ctaDisabled =
    submitting || isClosed || isPaused || !userLoaded || hasUnavailableItems || stockBlocked;

  return (
    <Screen>
      {/* Header — web's sticky cart header, sans back button (tab root). */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>{copy.title}</ThemedText>
      </View>

      {!hydrated ? (
        <View style={styles.center}>
          <LoadingIndicator />
        </View>
      ) : items.length === 0 ? (
        <EmptyCart />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.listContent}>
            {/* Closed banner (web parity) */}
            {isClosed && (
              <View style={styles.closedBanner}>
                <Info size={16} color={colors.accent} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.closedBannerHeading}>
                    {checkoutCopy.closedHeading}
                  </ThemedText>
                  {formatOpeningCopy(storeStatus?.nextOpenAtUtc) ? (
                    <ThemedText style={styles.closedBannerText}>
                      {formatOpeningCopy(storeStatus?.nextOpenAtUtc)}
                    </ThemedText>
                  ) : null}
                  <ThemedText style={[styles.closedBannerText, { opacity: 0.8 }]}>
                    {checkoutCopy.closedText}
                  </ThemedText>
                </View>
              </View>
            )}

            <SectionHead>
              {(() => {
                const mealCount = items.filter((i) => i.kind !== "drink").length;
                const drinkCount = items.filter((i) => i.kind === "drink").length;
                const parts: string[] = [];
                if (mealCount > 0) parts.push(copy.countMeal(mealCount));
                if (drinkCount > 0) parts.push(copy.countDrink(drinkCount));
                return parts.join(" · ");
              })()}
            </SectionHead>

            {items.map((item) => (
              <CartItemCard key={item.id} item={item} />
            ))}

            {/* Customer note to kitchen (web parity; input capped at 100) */}
            <SectionHead style={{ marginTop: spacing[5] }}>{checkoutCopy.noteHead}</SectionHead>
            <View style={styles.noteCard}>
              <TextInput
                value={customerNote}
                onChangeText={(v) => setCustomerNote(v.slice(0, 100))}
                maxLength={100}
                multiline
                numberOfLines={2}
                placeholder={checkoutCopy.notePlaceholder}
                placeholderTextColor="rgba(255,255,255,0.28)"
                style={styles.noteInput}
              />
              <ThemedText style={styles.noteCounter}>{customerNote.length}/100</ThemedText>
            </View>

            {/* Coupon (only for logged-in users with something to apply) */}
            {appliedCoupon || (user && usableCoupons.length > 0) ? (
              <>
                <SectionHead style={{ marginTop: spacing[5] }}>
                  {couponCopy.cartSectionHead}
                </SectionHead>
                {appliedCoupon && discountPreview ? (
                  <View style={styles.couponCard}>
                    <View style={styles.couponIcon}>
                      <BadgePercent size={18} color={colors.accent} strokeWidth={1.75} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText style={styles.couponCode}>{appliedCoupon.code}</ThemedText>
                      <ThemedText style={styles.couponMeta}>
                        {couponCopy.percentOff(appliedCoupon.percentage)} · −
                        {formatPriceKr(discountPreview.discountAmountOre)}
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={clearSelectedCoupon}
                      style={styles.couponRemove}
                      accessibilityRole="button"
                      accessibilityLabel={couponCopy.cartRemove}
                    >
                      <X size={13} color="rgba(255,255,255,0.35)" strokeWidth={1.6} />
                      <ThemedText style={styles.couponRemoveText}>
                        {couponCopy.cartRemove}
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => router.push("/kuponger")}
                    style={({ pressed }) => [
                      styles.couponCard,
                      pressed && { backgroundColor: colors.cardAlt },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={couponCopy.cartChoose}
                  >
                    <View style={styles.couponIcon}>
                      <BadgePercent size={18} color={colors.accent} strokeWidth={1.75} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText style={styles.couponCode}>{couponCopy.cartChoose}</ThemedText>
                      <ThemedText style={styles.couponMeta}>
                        {couponCopy.cartChooseSub(usableCoupons.length)}
                      </ThemedText>
                    </View>
                    <ChevronRight size={15} color="rgba(255,255,255,0.3)" />
                  </Pressable>
                )}
              </>
            ) : null}

            <SectionHead style={{ marginTop: spacing[5] }}>{copy.summaryHead}</SectionHead>
            <SummaryCard
              coupon={appliedCoupon}
              discountAmountOre={discountPreview?.discountAmountOre ?? 0}
              effectiveTotalOre={effectiveTotalOre}
            />

            {/* Payment methods (web parity: pay_on_site / stripe / swish-disabled) */}
            <SectionHead style={{ marginTop: spacing[5] }}>
              {checkoutCopy.paymentHeading}
            </SectionHead>
            <View style={[styles.paymentCard, isClosed && { opacity: 0.55 }]} pointerEvents={isClosed ? "none" : "auto"}>
              <PaymentRow
                label={checkoutCopy.payAtPickup}
                sublabel={checkoutCopy.payAtPickupSub}
                icon={<Wallet size={18} color="rgba(255,255,255,0.75)" strokeWidth={1.5} />}
                iconBg="rgba(255,255,255,0.07)"
                selected={paymentMethod === "pay_on_site"}
                onSelect={() => setPaymentMethod("pay_on_site")}
              />
              <PaymentRow
                label={checkoutCopy.payOnline}
                sublabel={checkoutCopy.payOnlineSub}
                icon={<CreditCard size={18} color={colors.textPrimary} strokeWidth={1.6} />}
                iconBg={colors.accent}
                selected={paymentMethod === "stripe"}
                onSelect={() => setPaymentMethod("stripe")}
                disabled={isDrinksOnly}
              />
              <PaymentRow
                label={checkoutCopy.swish}
                sublabel={checkoutCopy.comingSoon}
                icon={<ThemedText style={styles.swishIcon}>S</ThemedText>}
                iconBg="#0F4EFF"
                selected={false}
                onSelect={() => {}}
                disabled
                last
              />
            </View>

            {/* Drinks-only: explain why online payment is unavailable */}
            {isDrinksOnly && (
              <View style={styles.mutedBox}>
                <ThemedText style={styles.mutedBoxText}>
                  {checkoutCopy.onlineDrinksOnly}
                </ThemedText>
              </View>
            )}

            {/* Pay-at-counter info box (web parity) */}
            {paymentMethod === "pay_on_site" && (
              <View style={styles.infoBox}>
                <ThemedText style={styles.infoBoxHeading}>{checkoutCopy.infoHeading}</ThemedText>
                <ThemedText style={styles.infoBoxText}>{checkoutCopy.infoText}</ThemedText>
              </View>
            )}

            {/* Errors */}
            {error && !stockBlocked ? (
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            ) : null}
            {stockBlocked && error ? (
              <View style={styles.warnBox}>
                <AlertTriangle size={14} color={colors.accent} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.warnBoxHeading}>{error}</ThemedText>
                  <Pressable
                    onPress={() => router.navigate("/(tabs)/meny")}
                    style={styles.inlineAction}
                    accessibilityRole="button"
                  >
                    <ThemedText style={styles.inlineActionText}>{copy.emptyCta}</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* ── Sticky bottom CTA (web parity) ── */}
          <View style={styles.bottomBar}>
            {activeReservationError && (
              <View style={styles.warnBox}>
                <AlertTriangle size={15} color={colors.accent} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.warnBoxHeading}>
                    {checkoutCopy.activeReservationTitle}
                  </ThemedText>
                  <ThemedText style={styles.warnBoxText}>
                    {checkoutCopy.activeReservationBody}
                  </ThemedText>
                  {activeOrderIdFromError ? (
                    <Pressable
                      onPress={() => router.push(`/order/${activeOrderIdFromError}`)}
                      style={styles.inlineAction}
                      accessibilityRole="button"
                    >
                      <ThemedText style={styles.inlineActionText}>
                        {checkoutCopy.activeReservationViewOrder}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            )}

            {hasUnavailableItems && (
              <View style={styles.warnBox}>
                <AlertTriangle size={14} color={colors.accent} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.warnBoxHeading}>
                    {checkoutCopy.unavailableHeading}
                  </ThemedText>
                  <ThemedText style={styles.warnBoxText}>
                    {checkoutCopy.unavailableText}
                  </ThemedText>
                </View>
              </View>
            )}

            {!authEmail && userLoaded && (
              <View style={styles.mutedBox}>
                <ThemedText style={styles.accountRequiredTitle}>
                  {checkoutCopy.accountRequiredTitle}
                </ThemedText>
                <ThemedText style={styles.accountRequiredBody}>
                  {checkoutCopy.accountRequiredBody}
                </ThemedText>
                <Pressable onPress={goToLogin} style={styles.inlineAction} accessibilityRole="button">
                  <ThemedText style={styles.inlineActionText}>
                    {checkoutCopy.accountRequiredCta}
                  </ThemedText>
                </Pressable>
              </View>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={ctaDisabled}
              style={({ pressed }) => [
                styles.cta,
                ctaMuted && styles.ctaMuted,
                (submitting || !userLoaded) && { opacity: 0.7 },
                pressed && !ctaDisabled && { backgroundColor: colors.accentHover },
              ]}
              accessibilityRole="button"
              accessibilityLabel={ctaLabel}
            >
              <ThemedText style={[styles.ctaText, ctaMuted && styles.ctaTextMuted]}>
                {submitting
                  ? paymentMethod === "stripe"
                    ? checkoutCopy.redirecting
                    : checkoutCopy.submitting
                  : ctaLabel}
              </ThemedText>
            </Pressable>
            <ThemedText style={styles.terms}>
              {checkoutCopy.termsPrefix}
              <ThemedText
                style={styles.termsLink}
                onPress={() => Linking.openURL(`${env.EXPO_PUBLIC_WEB_URL}/kopvillkor`)}
              >
                {checkoutCopy.termsLink}
              </ThemedText>
              .
            </ThemedText>
          </View>
        </>
      )}
    </Screen>
  );
}

/* ── Date helpers (verbatim web ports, sv-SE only — mobile is sv-only) ── */

function formatNextOpen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return checkoutCopy.openAt(time);
}

function formatOpeningCopy(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return checkoutCopy.openToday(time);
  return checkoutCopy.openOn(
    d.toLocaleString("sv-SE", { weekday: "short", hour: "2-digit", minute: "2-digit" })
  );
}

/* ── Payment method row (port of the web PaymentRow) ── */

function PaymentRow({
  label,
  sublabel,
  icon,
  iconBg,
  selected,
  onSelect,
  disabled,
  last,
}: {
  label: string;
  sublabel?: string;
  icon: ReactNode;
  iconBg: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onSelect}
      disabled={disabled}
      style={[
        styles.paymentRow,
        selected && { backgroundColor: "rgba(232,101,10,0.05)" },
        !last && { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
        disabled && { opacity: 0.45 },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
    >
      <View style={[styles.paymentIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.paymentLabel}>{label}</ThemedText>
        {sublabel ? <ThemedText style={styles.paymentSublabel}>{sublabel}</ThemedText> : null}
      </View>
      <View style={[styles.radioOuter, selected && { borderColor: colors.accent }]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </Pressable>
  );
}

/* ── Item card (unchanged from Feature 4) ─────────────────── */

function CartItemCard({ item }: { item: CartItem }) {
  const { updateQuantity, updateSize, removeItem } = useCart();

  const isDrink = item.kind === "drink";
  const size = isDrink ? undefined : MEAL_SIZES.find((s) => s.id === item.sizeId);
  const multiplier = size?.priceMultiplier ?? 1;
  const macroMult = size?.macroMultiplier ?? 1;
  const surcharge = item.ingredientSurchargeKr ?? 0;
  // Fixed meal: keep the cart preview in lockstep with the backend's öre
  // rounding. Custom/Nutri Anpassar keeps its float approximation since the
  // backend recomputes that path. (Verbatim web logic.)
  const isFixedMeal = !isDrink && !item.isCustom && surcharge === 0;
  const unitPriceKr =
    isDrink && item.drink
      ? item.drink.priceOre / 100
      : isFixedMeal
        ? previewMealPriceOre(item.meal.basePrice, multiplier) / 100
        : item.meal.basePrice * multiplier + surcharge;
  const linePriceKr = isFixedMeal
    ? (previewMealPriceOre(item.meal.basePrice, multiplier) * item.quantity) / 100
    : unitPriceKr * item.quantity;

  const macros =
    item.isCustom && item.customMacros
      ? normalizeMacroSnapshot(item.customMacros)
      : normalizeMacroSnapshot({
          calories: Math.round(item.meal.macros.calories * macroMult),
          proteinG: Math.round(item.meal.macros.proteinG * macroMult),
          carbsG: Math.round(item.meal.macros.carbsG * macroMult),
          fatG: Math.round(item.meal.macros.fatG * macroMult),
          fiberG: Math.round(item.meal.macros.fiberG * macroMult),
        });

  const totalGramsBase = item.meal.ingredients.reduce((s, ing) => s + (ing.amountG ?? 0), 0);
  const grams =
    !isDrink && totalGramsBase > 0 ? `${Math.round(totalGramsBase * macroMult)}g` : null;
  const sizeShort = isDrink
    ? item.drink?.volumeML
      ? `${item.drink.volumeML} ml`
      : null
    : (SIZE_LABEL_SHORT[item.sizeId] ?? size?.label ?? "M");
  const isUnavailable = item.meal.available === false;
  const canSwitchSize = !isDrink && !item.isCustom && item.meal.portionMode !== "fixed";

  return (
    <View style={styles.itemWrap}>
      <View style={[styles.itemCard, isUnavailable && styles.itemCardUnavailable]}>
        {/* Top: image + body */}
        <View style={styles.itemTop}>
          <View style={styles.itemImageWrap}>
            {item.meal.image ? (
              <Image
                source={{ uri: item.meal.image }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityLabel={item.meal.name}
              />
            ) : (
              <View style={styles.itemImagePlaceholder}>
                <UtensilsCrossed size={20} color="rgba(255,255,255,0.2)" />
              </View>
            )}
          </View>

          <View style={styles.itemBody}>
            <View>
              <View style={styles.itemTitleRow}>
                <ThemedText style={styles.itemName} numberOfLines={2}>
                  {item.meal.name}
                </ThemedText>
                {item.isCustom ? (
                  <View style={styles.customBadge}>
                    <ThemedText style={styles.customBadgeText}>{copy.itemCustom}</ThemedText>
                  </View>
                ) : null}
                {item.slot ? (
                  <View style={styles.slotBadge}>
                    <ThemedText style={styles.slotBadgeText}>{item.slot.toUpperCase()}</ThemedText>
                  </View>
                ) : null}
              </View>
              <View style={styles.itemMetaRow}>
                {sizeShort || grams ? (
                  <View style={styles.sizePill}>
                    <ThemedText style={styles.sizePillText}>
                      {sizeShort}
                      {grams ? ` · ${grams}` : ""}
                    </ThemedText>
                  </View>
                ) : null}
                {!isDrink && (
                  <>
                    <ThemedText style={styles.metaDot}>·</ThemedText>
                    <ThemedText style={[styles.metaText, { color: colors.accent, fontFamily: fontFamily.monoMedium }]}>
                      {macros.proteinG}g
                    </ThemedText>
                    <ThemedText style={styles.metaDot}>·</ThemedText>
                    <ThemedText style={styles.metaText}>{macros.calories} kcal</ThemedText>
                  </>
                )}
              </View>
            </View>

            <View style={styles.itemPriceRow}>
              <ThemedText style={styles.linePrice}>{formatPriceKr(krToOre(linePriceKr))}</ThemedText>
              {item.quantity > 1 && (
                <ThemedText style={styles.unitPrice}>
                  {formatPriceKr(krToOre(unitPriceKr))} × {item.quantity}
                </ThemedText>
              )}
            </View>
            {surcharge > 0 && (
              <ThemedText style={styles.surchargeText}>
                {checkoutCopy.surcharge(surcharge)}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Footer: qty stepper + size switch + remove */}
        <View style={styles.itemFooter}>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => updateQuantity(item.id, item.quantity - 1)}
              style={styles.stepperButton}
              accessibilityRole="button"
              accessibilityLabel={copy.qtyDecrease}
            >
              <Minus size={12} color="rgba(255,255,255,0.5)" strokeWidth={2} />
            </Pressable>
            <ThemedText style={styles.stepperValue}>{item.quantity}</ThemedText>
            <Pressable
              onPress={() => updateQuantity(item.id, item.quantity + 1)}
              style={styles.stepperButton}
              accessibilityRole="button"
              accessibilityLabel={copy.qtyIncrease}
            >
              <Plus size={12} color="rgba(255,255,255,0.5)" strokeWidth={2} />
            </Pressable>
          </View>

          {canSwitchSize && (
            <View style={styles.sizeGroup}>
              {CUSTOMER_SIZE_OPTIONS.map((s) => {
                const isSelected = item.sizeId === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => updateSize(item.id, s.id)}
                    style={[styles.sizeButton, isSelected && styles.sizeButtonSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={s.label}
                  >
                    <ThemedText style={[styles.sizeLabel, isSelected && styles.sizeLabelSelected]}>
                      {s.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable
            onPress={() => removeItem(item.id)}
            style={styles.removeButton}
            accessibilityRole="button"
            accessibilityLabel={copy.itemRemove}
          >
            <X size={13} color="rgba(255,255,255,0.25)" strokeWidth={1.6} />
            <ThemedText style={styles.removeText}>{copy.itemRemove}</ThemedText>
          </Pressable>
        </View>
      </View>

      {isUnavailable && (
        <View style={styles.unavailableBox}>
          <AlertTriangle size={13} color={colors.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.unavailableHeading}>{copy.stockOutHeading}</ThemedText>
            <ThemedText style={styles.unavailableName}>
              {item.meal.name}
              {sizeShort ? ` · ${sizeShort}` : ""}
            </ThemedText>
            <ThemedText style={styles.unavailableText}>{copy.stockOutText}</ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

/* ── Summary (web: Delsumma / Upphämtning Gratis / Totalt, plus the
 *    mobile coupon-preview row — backend recomputes at order time) ── */

function SummaryCard({
  coupon,
  discountAmountOre,
  effectiveTotalOre,
}: {
  coupon: ApiCoupon | null;
  discountAmountOre: number;
  effectiveTotalOre: number;
}) {
  const { subtotalOre } = useCart();
  return (
    <View style={styles.summaryCard}>
      <SummaryRow label={copy.summarySubtotal} value={formatPriceKr(subtotalOre)} />
      {coupon ? (
        <SummaryRow
          label={couponCopy.cartDiscountRow(coupon.code, coupon.percentage)}
          value={`−${formatPriceKr(discountAmountOre)}`}
          valueAccent
        />
      ) : null}
      <SummaryRow label={copy.summaryPickup} value={copy.summaryFree} valueMuted />
      <SummaryRow label={copy.summaryTotal} value={formatPriceKr(effectiveTotalOre)} isTotal />
    </View>
  );
}

function SummaryRow({
  label,
  value,
  valueMuted,
  valueAccent,
  isTotal,
}: {
  label: string;
  value: string;
  valueMuted?: boolean;
  valueAccent?: boolean;
  isTotal?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, isTotal && styles.summaryRowTotal]}>
      <ThemedText style={[styles.summaryLabel, isTotal && styles.summaryLabelTotal]}>
        {label}
      </ThemedText>
      <ThemedText
        style={[
          styles.summaryValue,
          isTotal && styles.summaryValueTotal,
          valueMuted && styles.summaryValueMuted,
          valueAccent && styles.summaryValueAccent,
        ]}
      >
        {value}
      </ThemedText>
    </View>
  );
}

/* ── Empty state (port of the web EmptyCart, static ring) ──── */

function EmptyCart() {
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={styles.emptyContent}>
      <View style={styles.emptyCard}>
        <View style={styles.emptyIconWrap}>
          <View style={styles.emptyIconRing} />
          <View style={styles.emptyIconInner}>
            <ShoppingBag size={32} strokeWidth={1.75} color={colors.accent} />
          </View>
        </View>
        <ThemedText style={styles.emptyHeading}>{copy.emptyHeading}</ThemedText>
        <ThemedText style={styles.emptyText}>{copy.emptyText}</ThemedText>
        <Pressable
          onPress={() => router.navigate("/(tabs)/meny")}
          style={({ pressed }) => [styles.emptyCta, pressed && { backgroundColor: colors.accentHover }]}
          accessibilityRole="button"
          accessibilityLabel={copy.emptyCta}
        >
          <Menu size={14} color={colors.textPrimary} strokeWidth={1.75} />
          <ThemedText style={styles.emptyCtaText}>{copy.emptyCta}</ThemedText>
        </Pressable>
      </View>
      <ThemedText style={styles.emptySubline}>{copy.emptySubline}</ThemedText>
    </ScrollView>
  );
}

/* ── Local helpers ─────────────────────────────────────────── */

function SectionHead({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <ThemedText style={[styles.sectionHead, style]}>{children}</ThemedText>;
}

const styles = StyleSheet.create({
  header: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[6] },
  sectionHead: {
    marginHorizontal: spacing[1],
    marginTop: spacing[5],
    marginBottom: spacing[3],
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    color: colors.textMuted,
    textTransform: "uppercase",
  },

  /* Closed banner */
  closedBanner: {
    flexDirection: "row",
    gap: spacing[3],
    marginTop: spacing[4],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.25)",
    backgroundColor: "rgba(232,101,10,0.08)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  closedBannerHeading: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  closedBannerText: { marginTop: 2, fontSize: 12.5, lineHeight: 18, color: "rgba(255,255,255,0.55)" },

  /* Item card */
  itemWrap: { marginBottom: spacing[3] },
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  itemCardUnavailable: { borderColor: "rgba(232,101,10,0.30)" },
  itemTop: { flexDirection: "row", alignItems: "stretch" },
  itemImageWrap: { width: 96, minHeight: 96, backgroundColor: colors.cardAlt },
  itemImagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  itemBody: {
    flex: 1,
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  itemTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], flexWrap: "wrap" },
  itemName: {
    fontSize: 14,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  customBadge: {
    backgroundColor: "rgba(232,101,10,0.14)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  customBadgeText: { fontSize: 10, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  slotBadge: {
    backgroundColor: "rgba(232,101,10,0.18)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.3)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  slotBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.8,
    color: colors.accent,
  },
  itemMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  sizePill: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sizePillText: {
    fontSize: 10.5,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 0.3,
    color: "rgba(255,255,255,0.5)",
  },
  metaDot: { fontSize: 11, color: "rgba(255,255,255,0.25)" },
  metaText: { fontSize: 11.5, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.35)" },
  itemPriceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  linePrice: {
    fontSize: 15,
    fontFamily: fontFamily.monoMedium,
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  unitPrice: { fontSize: 11, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.25)" },
  surchargeText: { fontSize: 11, color: colors.accent },
  itemFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 2,
  },
  stepperButton: { height: 30, width: 32, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  stepperValue: {
    width: 28,
    textAlign: "center",
    fontSize: 13,
    fontFamily: fontFamily.monoMedium,
    color: colors.textPrimary,
  },
  sizeGroup: {
    flexDirection: "row",
    gap: spacing[1],
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 3,
  },
  sizeButton: { height: 26, width: 32, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  sizeButtonSelected: { backgroundColor: colors.accent },
  sizeLabel: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: "rgba(255,255,255,0.45)" },
  sizeLabelSelected: { color: colors.textPrimary },
  removeButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  removeText: { fontSize: 11.5, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.25)" },

  /* Unavailable warning */
  unavailableBox: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: spacing[1],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.28)",
    backgroundColor: "rgba(18,6,0,0.85)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  unavailableHeading: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  unavailableName: { marginTop: 2, fontSize: 11.5, color: "rgba(255,255,255,0.5)" },
  unavailableText: { marginTop: 2, fontSize: 11, color: "rgba(255,255,255,0.35)" },

  /* Customer note */
  noteCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  noteInput: {
    minHeight: 48,
    fontSize: 13.5,
    fontFamily: fontFamily.body,
    color: "rgba(255,255,255,0.92)",
    textAlignVertical: "top",
    padding: 0,
  },
  noteCounter: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 11,
    fontFamily: fontFamily.mono,
    color: "rgba(255,255,255,0.45)",
  },

  /* Summary */
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  summaryRowTotal: { borderBottomWidth: 0, paddingVertical: spacing[4] },
  summaryLabel: { fontSize: 13.5, color: colors.textSecondary },
  summaryLabelTotal: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  summaryValue: {
    fontSize: 13.5,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  summaryValueTotal: { fontSize: 16, fontFamily: fontFamily.monoMedium },
  summaryValueMuted: { fontSize: 11, color: "rgba(255,255,255,0.28)" },
  summaryValueAccent: { color: "#4ade80" },

  /* Coupon section */
  couponCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  couponIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
  },
  couponCode: {
    fontSize: 13.5,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 0.2,
    color: colors.textPrimary,
  },
  couponMeta: { marginTop: 2, fontSize: 11.5, color: colors.textTertiary },
  couponRemove: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  couponRemoveText: { fontSize: 11.5, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.35)" },

  /* Payment methods */
  paymentCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  paymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentLabel: { fontSize: 14, fontFamily: fontFamily.bodyMedium, color: colors.textPrimary },
  paymentSublabel: { marginTop: 2, fontSize: 11, color: "rgba(255,255,255,0.3)" },
  swishIcon: { fontSize: 13, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },

  /* Info / muted / warning boxes */
  infoBox: {
    marginTop: spacing[3],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.18)",
    backgroundColor: "rgba(232,101,10,0.08)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  infoBoxHeading: { fontSize: 13, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  infoBoxText: { marginTop: 2, fontSize: 11.5, lineHeight: 16, color: "rgba(255,255,255,0.6)" },
  mutedBox: {
    marginTop: spacing[3],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  mutedBoxText: { fontSize: 11.5, lineHeight: 16, color: "rgba(255,255,255,0.6)" },
  accountRequiredTitle: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  accountRequiredBody: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 16,
    color: "rgba(255,255,255,0.5)",
  },
  warnBox: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: spacing[3],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.28)",
    backgroundColor: "rgba(18,6,0,0.9)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  warnBoxHeading: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  warnBoxText: { marginTop: 2, fontSize: 11.5, lineHeight: 16, color: "rgba(255,255,255,0.55)" },
  inlineAction: {
    alignSelf: "flex-start",
    marginTop: spacing[2],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.35)",
    backgroundColor: "rgba(232,101,10,0.12)",
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
  },
  inlineActionText: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  errorText: { marginTop: spacing[3], fontSize: 13, color: "#F87171" },

  /* Bottom CTA bar */
  bottomBar: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    backgroundColor: "rgba(17,17,17,0.96)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 0,
  },
  cta: {
    height: 50,
    marginTop: spacing[3],
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[5],
  },
  ctaMuted: { backgroundColor: "rgba(255,255,255,0.08)" },
  ctaText: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: colors.textPrimary, letterSpacing: 0.1 },
  ctaTextMuted: { color: "rgba(255,255,255,0.65)" },
  terms: {
    marginTop: spacing[2],
    textAlign: "center",
    fontSize: 10.5,
    lineHeight: 15,
    color: "rgba(255,255,255,0.35)",
  },
  termsLink: { fontSize: 10.5, textDecorationLine: "underline", color: "rgba(255,255,255,0.55)" },

  /* Empty state */
  emptyContent: { flexGrow: 1, paddingHorizontal: spacing[4], paddingTop: spacing[10] },
  emptyCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 32,
    overflow: "hidden",
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  emptyIconRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.12)",
  },
  emptyIconInner: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    bottom: 14,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.08)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.18)",
  },
  emptyHeading: {
    textAlign: "center",
    fontSize: 20,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.4,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: "center",
    alignSelf: "center",
    maxWidth: 260,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: 28,
  },
  emptyCta: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  emptyCtaText: { fontSize: 14.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  emptySubline: {
    marginTop: 22,
    textAlign: "center",
    fontSize: 11.5,
    letterSpacing: 0.2,
    color: "rgba(255,255,255,0.28)",
  },
});
