import { useEffect, useState, type ReactNode } from "react";
import {
  Modal,
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
import { CUSTOMER_SIZE_OPTIONS, MEAL_SIZES } from "@/utils/pricing";
import { getItemLineTotalOre, getItemUnitPriceOre } from "@/utils/cartMath";
import { formatPriceKr, krToOre } from "@/utils/money";
import { applyDiscountPreview } from "@/utils/discountMath";
import { normalizeMacroSnapshot } from "@/utils/macroMath";
import {
  formatOrderError,
  isActiveReservationErr,
  isCouponRejectedError,
  isStockOutError,
} from "@/utils/orderErrors";
import { useCheckoutDiscount } from "@/context/CheckoutDiscountContext";
import { useIncludedDrink } from "@/context/IncludedDrinkContext";
import { useStampCardStatusQuery } from "@/services/api/stampCardQueries";
import { getDrinks } from "@/services/api/drinks";
import { GoWellCartSection, isQualifyingMealItem } from "./GoWellCartSection";
import { isDrinkInStock, goWellFlavorLabel } from "@/features/menu/goWellFlavors";
import { drinkName } from "@/features/menu/drinkText";
import {
  isIncludedDrinkError,
  includedDrinkErrorMessage,
  includedDrinkRecovery,
} from "./includedDrinkErrors";
import { StampCardCheckoutCard, isQualifyingCartItem } from "./StampCardCheckoutCard";
import {
  isStampCardError,
  isStampCardSelectionDead,
  stampCardErrorMessage,
} from "./stampCardErrors";
import { setActiveOrderId, getActiveOrderId, setPendingStripeClear } from "@/utils/activeOrder";
import { markOrderSuccessForPushPreprompt } from "@/features/push/orderSuccessSignal";
import type { TFunction } from "i18next";

import { openPolicy } from "@/utils/webUrls";
import { formatDateTime, formatTime, useLanguage, useTranslation } from "@/i18n";
import type { AppLanguage } from "@/i18n";
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
  const { t } = useTranslation();
  const { language } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, hydrated, clearCart, subtotalOre, totalOre } = useCart();
  const { selectedCoupon, clearSelectedCoupon } = useCoupon();
  const { discount, clearStampCard } = useCheckoutDiscount();
  const { selection: includedDrinkSelection, reset: resetIncludedDrink } = useIncludedDrink();
  const { user, loading: authLoading } = useAuth();

  const authEmail = user?.email ?? null;
  const authName = (user?.user_metadata?.full_name as string | undefined) || t("auth.guest");
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

  /* ── Stamp card (patch 16C2) ────────────────────────────────────── */

  // Same query key the card itself uses, so this shares the cached row rather
  // than fetching twice. Caps come from the reward the customer selected, not
  // from this status-level default — see selectedRewardMaxValueOre below.
  const stampCardStatus = useStampCardStatusQuery().data ?? null;

  // Only rides along when it still points at a line that is in the cart —
  // removing the chosen meal must not send the server a dangling line id.
  const activeStampCard =
    discount.type === "stamp-card" &&
    user &&
    items.some((i) => i.clientLineId === discount.clientLineId && isQualifyingCartItem(i))
      ? discount
      : null;

  // Preview only. The server recomputes from its own prices and cap, and the
  // order response is what the customer is actually charged. The cap is the
  // SELECTED reward's own — rewards earned under different settings carry
  // different caps, so a shared value would preview the wrong number.
  const stampCardItem = activeStampCard
    ? items.find((i) => i.clientLineId === activeStampCard.clientLineId) ?? null
    : null;
  const selectedRewardMaxValueOre =
    stampCardStatus?.availableRewardList?.find((r) => r.id === activeStampCard?.rewardId)
      ?.maxValueOre ?? null;
  const stampCardPreviewOre =
    stampCardItem && selectedRewardMaxValueOre !== null
      ? Math.min(krToOre(stampCardItem.meal.basePrice), selectedRewardMaxValueOre)
      : 0;

  // Every precondition the request depends on, checked against the LATEST
  // server answer rather than what was true when the customer tapped.
  const clientLineIds = items.map((i) => i.clientLineId);
  const allLineIdsValidAndUnique =
    clientLineIds.every((id) => !!id) && new Set(clientLineIds).size === clientLineIds.length;
  const canSubmitStampCard =
    !!activeStampCard &&
    !!stampCardItem &&
    allLineIdsValidAndUnique &&
    // Still offered by the server. A reward reserved on another device, or
    // spent since the cart was opened, has left this list. Only an ACTUAL
    // list may veto, though — a failed/offline status fetch has no list and
    // must not silently drop the customer's reward with a misleading error
    // (the coupon path has the same only-server-truth rule). If the reward
    // truly died, order creation rejects it server-side with an honest
    // stamp-card error code instead.
    (stampCardStatus?.availableRewardList == null ||
      stampCardStatus.availableRewardList.some((r) => r.id === activeStampCard.rewardId));

  // Both discounts active is unrepresentable in CheckoutDiscountContext, so
  // this can only fire if that invariant is ever broken — better a refused
  // submit than a request the backend 400s.
  const hasDiscountConflict = !!activeStampCard && !!appliedCoupon;

  const discountPreview = appliedCoupon && !activeStampCard
    ? applyDiscountPreview(subtotalOre, appliedCoupon.percentage)
    : null;

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

  /* ── Included GoWell drink (patch 17B) ──────────────────────────── */

  const goWellDrinks = (useQuery({ queryKey: ["drinks"], queryFn: getDrinks }).data ?? [])
    .filter((d) => d.isGoWell === true);

  // Every precondition re-checked against the LATEST server answer rather
  // than what was true when the customer picked. The server still decides —
  // this only avoids sending a request we already know it will refuse.
  const includedDrinkLine =
    includedDrinkSelection.type === "selected"
      ? items.find((i) => i.clientLineId === includedDrinkSelection.clientLineId) ?? null
      : null;
  const includedDrinkProduct =
    includedDrinkSelection.type === "selected"
      ? goWellDrinks.find((d) => d.id === includedDrinkSelection.drinkId) ?? null
      : null;

  const activeIncludedDrinkLineId =
    includedDrinkSelection.type === "selected" &&
    storeStatus?.includedDrinkWindowOpen === true &&
    items.some(isQualifyingMealItem) &&
    allLineIdsValidAndUnique &&
    includedDrinkLine?.kind === "drink" &&
    !!includedDrinkProduct &&
    isDrinkInStock(includedDrinkProduct) &&
    (includedDrinkProduct.stockQuantity ?? 0) >= includedDrinkLine.quantity
      ? includedDrinkSelection.clientLineId
      : undefined;

  // Preview only — the server recomputes and its answer is what is charged.
  const includedDrinkPreviewOre = activeIncludedDrinkLineId
    ? includedDrinkProduct?.priceOre ?? 0
    : 0;

  // Fixed discounts come off first, then the coupon percentage — mirroring
  // the backend's composition so the preview cannot disagree with the charge.
  // With no discounts at all this is still exactly the pre-coupon behavior.
  const afterFixedOre = Math.max(
    0,
    totalOre - (activeStampCard ? stampCardPreviewOre : 0) - includedDrinkPreviewOre
  );
  const effectiveTotalOre = discountPreview
    ? Math.max(0, afterFixedOre - discountPreview.discountAmountOre)
    : afterFixedOre;


  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pay_on_site");
  const [customerNote, setCustomerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 409 stock error → CTA disabled until the cart contents change (web parity).
  const [stockBlocked, setStockBlocked] = useState(false);
  const [activeReservationError, setActiveReservationError] = useState(false);
  const [activeOrderIdFromError, setActiveOrderIdFromError] = useState<string | null>(null);
  // Stamp card → coupon confirmation. The reverse direction lives in
  // StampCardCheckoutCard; both refuse to switch silently.
  const [couponConflictOpen, setCouponConflictOpen] = useState(false);

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

    // Last check before the request. No id is ever CREATED here — that would
    // hand the backend a different line id on every retry; a cart that cannot
    // produce valid unique ids is repaired on hydrate, not at submit time.
    if (hasDiscountConflict) {
      setError(t("stampCardCheckout.errorConflict"));
      return;
    }
    if (activeStampCard && !canSubmitStampCard) {
      clearStampCard();
      queryClient.invalidateQueries({ queryKey: ["stamp-card"] }).catch(() => {});
      setError(t("stampCardCheckout.errorLineMissing"));
      return;
    }

    setSubmitting(true);
    // Defense-in-depth: never start Stripe for a drinks-only cart (web parity).
    const effectivePaymentMethod: PaymentMethod = isDrinksOnly ? "pay_on_site" : paymentMethod;
    try {
      const order = await createOrder({
        customerName: authName,
        customerEmail: authEmail,
        paymentMethod: effectivePaymentMethod,
        customerNote: customerNote.trim() || undefined,
        // One reward per order: the tagged union in CheckoutDiscountContext
        // makes "both selected" unrepresentable, so this can never send a
        // coupon and a stamp card together.
        couponId: activeStampCard ? undefined : appliedCoupon?.id,
        stampCardRewardId: activeStampCard?.rewardId,
        stampCardLineId: activeStampCard?.clientLineId,
        // Only the line id — never a price, a discount, isGoWell or the
        // server clock. The backend recomputes all of it.
        includedDrinkLineId: activeIncludedDrinkLineId,
        items: items.map((item) => {
          if (item.kind === "drink" && item.drink) {
            return {
              clientLineId: item.clientLineId,
              mealId: item.drink.id,
              size: "medium",
              quantity: item.quantity,
            };
          }
          return {
            clientLineId: item.clientLineId,
            mealId: item.isCustom ? null : item.meal.id,
            size: item.sizeId,
            quantity: item.quantity,
            isTailored: item.isCustom,
            customMacros: item.customMacros,
            customIngredients: item.customIngredients,
            containerTypeId: item.containerTypeId,
            originalMealName: item.originalMealName,
            // A personalised menu meal goes up as a custom line with mealId
            // null. Without this the server cannot tell it was a breakfast,
            // and the 10–11 window would not apply to it.
            sourceMealId: item.isCustom ? item.meal.id : undefined,
          };
        }),
      });

      // Order exists — stamp the push pre-prompt's one-shot signal (patch
      // 10). Fire-and-forget: payment/navigation below is unchanged.
      markOrderSuccessForPushPreprompt(order.id);

      // The coupon was consumed server-side in the same transaction that
      // created the order (even for Stripe, where payment comes later) —
      // clear the selection and refresh the list so it renders as Använd.
      if (appliedCoupon) {
        clearSelectedCoupon();
        queryClient.invalidateQueries({ queryKey: ["coupons"] }).catch(() => {});
      }

      // Same for the stamp card: the order was accepted, so the reward is now
      // Reserved server-side and is no longer spendable. Clearing the
      // selection and refreshing the status here is what stops the next
      // checkout from offering a reward that would come back 409 — this is a
      // SUCCESS path, so nothing here shows an error.
      if (activeStampCard) {
        clearStampCard();
        queryClient.invalidateQueries({ queryKey: ["stamp-card"] }).catch(() => {});
      }

      if (effectivePaymentMethod === "stripe") {
        // Persist the active order BEFORE the session call so a failure never
        // loses the order (web parity).
        await setActiveOrderId(order.id);
        let checkoutUrl: string;
        try {
          const session = await createCheckoutSession(order.id);
          if (!session?.url) throw new Error("Checkout session missing url");
          checkoutUrl = session.url;
        } catch {
          // Order exists and is saved; cart is preserved — surface a clear
          // error and STAY in the cart (web parity).
          setError(t("checkout.errorStripeStartFailed"));
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
      } else if (isStampCardError(err)) {
        // No order was created. The cart is left exactly as it was — only the
        // stamp card selection is dropped, and only when the server says it is
        // genuinely dead rather than merely conflicting.
        if (isStampCardSelectionDead(err)) {
          clearStampCard();
          queryClient.invalidateQueries({ queryKey: ["stamp-card"] }).catch(() => {});
        }
        setError(stampCardErrorMessage(err, t) ?? t("checkout.errorGeneric"));
      } else if (isIncludedDrinkError(err)) {
        // No order was created. The cart, the drink line and its quantity are
        // all kept — only the inclusion is dropped, and the drink simply
        // becomes a paid one. A network failure carries no code, so it never
        // reaches this branch and the selection survives for the retry.
        resetIncludedDrink();
        const recovery = includedDrinkRecovery(err);
        if (recovery === "refetch-status") {
          queryClient.invalidateQueries({ queryKey: ["store", "status"] }).catch(() => {});
        } else if (recovery === "refetch-drinks") {
          queryClient.invalidateQueries({ queryKey: ["drinks"] }).catch(() => {});
        }
        setError(includedDrinkErrorMessage(err, t) ?? t("checkout.errorGeneric"));
      } else if (isCouponRejectedError(err)) {
        // Backend refused the coupon (used/expired/invalid) — no order was
        // created. Deselect it, refresh the list and surface the backend's
        // own message plus what just happened to the selection.
        clearSelectedCoupon();
        queryClient.invalidateQueries({ queryKey: ["coupons"] }).catch(() => {});
        const { message } = formatOrderError(err, t);
        setError(`${message ?? t("checkout.errorGeneric")} ${t("coupon.rejectedSuffix")}`);
      } else {
        // Stock details resolver: lets the sold-out copy name the item from
        // the cart's own metadata (meal, drink or custom-meal ingredient)
        // when the backend's structured name is missing. Never a UUID.
        const { message, unauthorized } = formatOrderError(err, t, (details) => {
          const clientLineId =
            typeof details.clientLineId === "string" ? details.clientLineId : null;
          const itemId = typeof details.itemId === "string" ? details.itemId : null;
          const ingredientId =
            typeof details.ingredientId === "string" ? details.ingredientId : null;
          for (const item of items) {
            if (clientLineId && item.clientLineId === clientLineId) {
              return item.originalMealName ?? item.meal.name;
            }
            if (itemId && item.meal.id === itemId) return item.meal.name;
            if (ingredientId) {
              const ing = item.customIngredients?.find((ci) => ci.ingredientId === ingredientId);
              if (ing?.name) return ing.name;
            }
          }
          return null;
        });
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

  const amountStr = formatPriceKr(effectiveTotalOre, language).replace(" kr", "");
  const ctaLabel = isClosed
    ? (formatNextOpen(storeStatus?.nextOpenAtUtc, t, language) ?? t("checkout.closedNow"))
    : isPaused
      ? t("checkout.pausedNow")
      : !userLoaded
        ? t("checkout.loading")
        : hasUnavailableItems || stockBlocked
          ? t("checkout.ctaCannotReserve")
          : !authEmail
            ? t("checkout.ctaLoginToReserve")
            : paymentMethod === "stripe"
              ? t("checkout.ctaPayOnline", { amount: amountStr })
              : t("checkout.ctaReserve", { amount: amountStr });
  const ctaMuted = isClosed || isPaused || hasUnavailableItems || stockBlocked;
  const ctaDisabled =
    submitting || isClosed || isPaused || !userLoaded || hasUnavailableItems || stockBlocked;

  return (
    <Screen>
      {/* Header — web's sticky cart header, sans back button (tab root). */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>{t("cart.title")}</ThemedText>
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
                    {t("checkout.closedHeading")}
                  </ThemedText>
                  {formatOpeningCopy(storeStatus?.nextOpenAtUtc, t, language) ? (
                    <ThemedText style={styles.closedBannerText}>
                      {formatOpeningCopy(storeStatus?.nextOpenAtUtc, t, language)}
                    </ThemedText>
                  ) : null}
                  <ThemedText style={[styles.closedBannerText, { opacity: 0.8 }]}>
                    {t("checkout.closedText")}
                  </ThemedText>
                </View>
              </View>
            )}

            <SectionHead>
              {(() => {
                const mealCount = items.filter((i) => i.kind !== "drink").length;
                const drinkCount = items.filter((i) => i.kind === "drink").length;
                const parts: string[] = [];
                if (mealCount > 0) parts.push(t("cart.countMeal", { count: mealCount }));
                if (drinkCount > 0) parts.push(t("cart.countDrink", { count: drinkCount }));
                return parts.join(" · ");
              })()}
            </SectionHead>

            {items.map((item) => (
              <CartItemCard key={item.id} item={item} />
            ))}

            {/* GoWell (patch 17B) — after the order lines, before the note.
                Renders nothing when there are no GoWell products at all. */}
            <View style={{ marginTop: spacing[5] }}>
              <GoWellCartSection />
            </View>

            {/* Customer note to kitchen (web parity; input capped at 100) */}
            <SectionHead style={{ marginTop: spacing[5] }}>{t("checkout.noteHead")}</SectionHead>
            <View style={styles.noteCard}>
              <TextInput
                value={customerNote}
                onChangeText={(v) => setCustomerNote(v.slice(0, 100))}
                maxLength={100}
                multiline
                numberOfLines={2}
                placeholder={t("checkout.notePlaceholder")}
                placeholderTextColor="rgba(255,255,255,0.28)"
                style={styles.noteInput}
              />
              <ThemedText style={styles.noteCounter}>{customerNote.length}/100</ThemedText>
            </View>

            {/* Stamp card (patch 16C2) — sits with the discount section, above
                the coupon, and renders nothing unless a reward is available.
                Selecting it clears any coupon after confirming. */}
            {user ? (
              <View style={{ marginTop: spacing[5] }}>
                <StampCardCheckoutCard items={items} />
              </View>
            ) : null}

            {/* Coupon (only for logged-in users with something to apply) */}
            {appliedCoupon || (user && usableCoupons.length > 0) ? (
              <>
                <SectionHead style={{ marginTop: spacing[5] }}>
                  {t("coupon.cartSectionHead")}
                </SectionHead>
                {appliedCoupon && discountPreview ? (
                  <View style={styles.couponCard}>
                    <View style={styles.couponIcon}>
                      <BadgePercent size={18} color={colors.accent} strokeWidth={1.75} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText style={styles.couponCode}>{appliedCoupon.code}</ThemedText>
                      <ThemedText style={styles.couponMeta}>
                        {t("coupon.percentOff", { pct: appliedCoupon.percentage })} · −
                        {formatPriceKr(discountPreview.discountAmountOre, language)}
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={clearSelectedCoupon}
                      style={styles.couponRemove}
                      accessibilityRole="button"
                      accessibilityLabel={t("coupon.cartRemove")}
                    >
                      <X size={13} color="rgba(255,255,255,0.35)" strokeWidth={1.6} />
                      <ThemedText style={styles.couponRemoveText}>
                        {t("coupon.cartRemove")}
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      // The other direction of the same rule: choosing a
                      // coupon while the stamp card is active asks first, so
                      // neither selection is ever dropped silently.
                      if (activeStampCard) setCouponConflictOpen(true);
                      else router.push("/kuponger");
                    }}
                    style={({ pressed }) => [
                      styles.couponCard,
                      pressed && { backgroundColor: colors.cardAlt },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t("coupon.cartChoose")}
                  >
                    <View style={styles.couponIcon}>
                      <BadgePercent size={18} color={colors.accent} strokeWidth={1.75} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText style={styles.couponCode}>{t("coupon.cartChoose")}</ThemedText>
                      <ThemedText style={styles.couponMeta}>
                        {t("coupon.cartChooseSub", { count: usableCoupons.length })}
                      </ThemedText>
                    </View>
                    <ChevronRight size={15} color="rgba(255,255,255,0.3)" />
                  </Pressable>
                )}
              </>
            ) : null}

            <SectionHead style={{ marginTop: spacing[5] }}>{t("cart.summaryHead")}</SectionHead>
            <SummaryCard
              coupon={activeStampCard ? null : appliedCoupon}
              discountAmountOre={discountPreview?.discountAmountOre ?? 0}
              effectiveTotalOre={effectiveTotalOre}
              stampCardDiscountOre={activeStampCard ? stampCardPreviewOre : 0}
              includedDrinkDiscountOre={includedDrinkPreviewOre}
              includedDrinkName={
                includedDrinkProduct ? goWellFlavorLabel(includedDrinkProduct, language) : null
              }
            />

            {/* Payment methods — release P28: "Betala online" is HIDDEN
                from the customer flow. The Stripe machinery (handleSubmit's
                stripe branch, session creation, webhooks) is untouched and
                unreachable from here; paymentMethod can only ever be
                pay_on_site. The Swish teaser stays as forward-looking
                context. */}
            <SectionHead style={{ marginTop: spacing[5] }}>
              {t("checkout.paymentHeading")}
            </SectionHead>
            <View style={[styles.paymentCard, isClosed && { opacity: 0.55 }]} pointerEvents={isClosed ? "none" : "auto"}>
              <PaymentRow
                label={t("checkout.payAtPickup")}
                sublabel={t("checkout.payAtPickupSub")}
                icon={<Wallet size={18} color="rgba(255,255,255,0.75)" strokeWidth={1.5} />}
                iconBg="rgba(255,255,255,0.07)"
                selected={paymentMethod === "pay_on_site"}
                onSelect={() => setPaymentMethod("pay_on_site")}
              />
              {/* Swish is a teaser only. The backend integration exists but is
                  switched off (Swish__Enabled=false), so nothing here may be
                  able to reach it: the row is disabled, carries no handler,
                  and paymentMethod cannot hold "swish". One label, no
                  sublabel — the copy is the whole message. */}
              <PaymentRow
                label={t("checkout.swishComingSoon")}
                icon={<ThemedText style={styles.swishIcon}>S</ThemedText>}
                iconBg="#0F4EFF"
                selected={false}
                onSelect={() => {}}
                disabled
                last
              />
            </View>

            {/* Pay-at-counter info box (web parity) */}
            {paymentMethod === "pay_on_site" && (
              <View style={styles.infoBox}>
                <ThemedText style={styles.infoBoxHeading}>{t("checkout.infoHeading")}</ThemedText>
                <ThemedText style={styles.infoBoxText}>{t("checkout.infoText")}</ThemedText>
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
                    <ThemedText style={styles.inlineActionText}>{t("cart.emptyCta")}</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* Stamp card → coupon: the mirror of the confirmation inside
              StampCardCheckoutCard, so switching is explicit in both
              directions. */}
          <SwitchToCouponConfirm
            visible={couponConflictOpen}
            onKeep={() => setCouponConflictOpen(false)}
            onSwitch={() => {
              setCouponConflictOpen(false);
              clearStampCard();
              router.push("/kuponger");
            }}
          />

          {/* ── Sticky bottom CTA (web parity) ── */}
          <View style={styles.bottomBar}>
            {activeReservationError && (
              <View style={styles.warnBox}>
                <AlertTriangle size={15} color={colors.accent} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.warnBoxHeading}>
                    {t("checkout.activeReservationTitle")}
                  </ThemedText>
                  <ThemedText style={styles.warnBoxText}>
                    {t("checkout.activeReservationBody")}
                  </ThemedText>
                  {activeOrderIdFromError ? (
                    <Pressable
                      onPress={() => router.push(`/order/${activeOrderIdFromError}`)}
                      style={styles.inlineAction}
                      accessibilityRole="button"
                    >
                      <ThemedText style={styles.inlineActionText}>
                        {t("checkout.activeReservationViewOrder")}
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
                    {t("checkout.unavailableHeading")}
                  </ThemedText>
                  <ThemedText style={styles.warnBoxText}>
                    {t("checkout.unavailableText")}
                  </ThemedText>
                </View>
              </View>
            )}

            {!authEmail && userLoaded && (
              <View style={styles.mutedBox}>
                <ThemedText style={styles.accountRequiredTitle}>
                  {t("checkout.accountRequiredTitle")}
                </ThemedText>
                <ThemedText style={styles.accountRequiredBody}>
                  {t("checkout.accountRequiredBody")}
                </ThemedText>
                <Pressable onPress={goToLogin} style={styles.inlineAction} accessibilityRole="button">
                  <ThemedText style={styles.inlineActionText}>
                    {t("checkout.accountRequiredCta")}
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
                    ? t("checkout.redirecting")
                    : t("checkout.submitting")
                  : ctaLabel}
              </ThemedText>
            </Pressable>
            <ThemedText style={styles.terms}>
              {t("checkout.termsPrefix")}
              <ThemedText
                style={styles.termsLink}
                onPress={() => void openPolicy("kopvillkor", language)}
              >
                {t("checkout.termsLink")}
              </ThemedText>
              .
            </ThemedText>
          </View>
        </>
      )}
    </Screen>
  );
}

/* ── Date helpers (verbatim web ports; locale follows the active language) ── */

function formatNextOpen(
  iso: string | null | undefined,
  t: TFunction,
  language: AppLanguage,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return t("checkout.openAt", { time: formatTime(d, language) });
}

function formatOpeningCopy(
  iso: string | null | undefined,
  t: TFunction,
  language: AppLanguage,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return t("checkout.openToday", { time: formatTime(d, language) });
  return t("checkout.openOn", {
    when: formatDateTime(d, language, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
  });
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
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { updateQuantity, updateSize, removeItem } = useCart();

  const isDrink = item.kind === "drink";
  const size = isDrink ? undefined : MEAL_SIZES.find((s) => s.id === item.sizeId);

  // The synthetic Meal wrapper on a drink line snapshots the Swedish name at
  // add time, so rendering item.meal.name directly would freeze the language
  // the customer happened to be using when they tapped add. The original
  // ApiDrink is kept on the line, so resolve from that instead and the cart
  // follows a language switch like every other screen.
  const displayName = isDrink && item.drink ? drinkName(item.drink, language) : item.meal.name;
  const macroMult = size?.macroMultiplier ?? 1;
  const surcharge = item.ingredientSurchargeKr ?? 0;
  // One pricing authority (utils/cartMath): the row and CartContext's summary
  // price every line through the same function, so they cannot disagree.
  // Custom/personalized lines carry the backend's exact öre price; fixed
  // meals keep the backend's whole-SEK rounding; drinks their öre price.
  const unitPriceOre = getItemUnitPriceOre(item);
  const linePriceOre = getItemLineTotalOre(item);

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

  // A custom/personalized line was ordered at the optimizer's grams, not at
  // the recipe's — and no size multiplier applies to it.
  const totalGramsBase =
    item.isCustom && item.customIngredients
      ? item.customIngredients.reduce((s, ing) => s + (ing.amountG ?? 0), 0)
      : Math.round(item.meal.ingredients.reduce((s, ing) => s + (ing.amountG ?? 0), 0) * macroMult);
  const grams = !isDrink && totalGramsBase > 0 ? `${totalGramsBase}g` : null;
  const sizeShort = isDrink
    ? item.drink?.volumeML
      ? `${item.drink.volumeML} ml`
      : null
    : // A personalized line has no size — an "M"/"L" badge would name a
      // portion that does not exist for it.
      item.isCustom
      ? null
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
                accessibilityLabel={displayName}
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
                  {displayName}
                </ThemedText>
                {item.isCustom ? (
                  <View style={styles.customBadge}>
                    <ThemedText style={styles.customBadgeText}>{t("cart.itemCustom")}</ThemedText>
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
                      {/* A personalized line has no size, so the pill is
                          grams alone — not a dangling " · " separator. */}
                      {[sizeShort, grams].filter(Boolean).join(" · ")}
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
              <ThemedText style={styles.linePrice}>{formatPriceKr(linePriceOre, language)}</ThemedText>
              {item.quantity > 1 && (
                <ThemedText style={styles.unitPrice}>
                  {formatPriceKr(unitPriceOre, language)} × {item.quantity}
                </ThemedText>
              )}
            </View>
            {surcharge > 0 && (
              <ThemedText style={styles.surchargeText}>
                {t("checkout.surcharge", { amount: surcharge })}
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
              accessibilityLabel={t("cart.qtyDecrease")}
            >
              <Minus size={12} color="rgba(255,255,255,0.5)" strokeWidth={2} />
            </Pressable>
            <ThemedText style={styles.stepperValue}>{item.quantity}</ThemedText>
            <Pressable
              onPress={() => updateQuantity(item.id, item.quantity + 1)}
              style={styles.stepperButton}
              accessibilityRole="button"
              accessibilityLabel={t("cart.qtyIncrease")}
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
            accessibilityLabel={t("cart.itemRemove")}
          >
            <X size={13} color="rgba(255,255,255,0.25)" strokeWidth={1.6} />
            <ThemedText style={styles.removeText}>{t("cart.itemRemove")}</ThemedText>
          </Pressable>
        </View>
      </View>

      {isUnavailable && (
        <View style={styles.unavailableBox}>
          <AlertTriangle size={13} color={colors.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.unavailableHeading}>{t("cart.stockOutHeading")}</ThemedText>
            <ThemedText style={styles.unavailableName}>
              {displayName}
              {sizeShort ? ` · ${sizeShort}` : ""}
            </ThemedText>
            <ThemedText style={styles.unavailableText}>{t("cart.stockOutText")}</ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

/* ── Summary (web: Delsumma / Upphämtning Gratis / Totalt, plus the
 *    mobile coupon-preview row — backend recomputes at order time) ── */

/** Stamp card → coupon confirmation. Same rule as the other direction: only
 * one reward per order, and the customer is told before anything changes. */
function SwitchToCouponConfirm({
  visible,
  onKeep,
  onSwitch,
}: {
  visible: boolean;
  onKeep: () => void;
  onSwitch: () => void;
}) {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onKeep}>
      <View style={styles.switchBackdrop}>
        <View style={styles.switchBox}>
          <ThemedText accessibilityRole="header" style={styles.switchTitle}>
            {t("stampCardCheckout.conflictTitle")}
          </ThemedText>
          <ThemedText style={styles.switchBody}>
            {t("stampCardCheckout.conflictToCouponBody")}
          </ThemedText>
          <View style={styles.switchActions}>
            <Pressable
              onPress={onKeep}
              style={({ pressed }) => [styles.switchSecondary, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.switchSecondaryLabel}>
                {t("stampCardCheckout.conflictKeepStampCard")}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onSwitch}
              style={({ pressed }) => [styles.switchPrimary, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.switchPrimaryLabel}>
                {t("stampCardCheckout.conflictSwitchToCoupon")}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SummaryCard({
  coupon,
  discountAmountOre,
  effectiveTotalOre,
  stampCardDiscountOre,
  includedDrinkDiscountOre,
  includedDrinkName,
}: {
  coupon: ApiCoupon | null;
  discountAmountOre: number;
  effectiveTotalOre: number;
  /** Preview of the stamp card discount, 0 when unused. The server decides
   * the real amount; this only keeps the summary honest before it answers. */
  stampCardDiscountOre: number;
  /** Preview of the included GoWell, 0 when unused. */
  includedDrinkDiscountOre: number;
  /** Flavour name for the row; null when nothing is included. */
  includedDrinkName: string | null;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { subtotalOre } = useCart();
  return (
    <View style={styles.summaryCard}>
      <SummaryRow label={t("cart.summarySubtotal")} value={formatPriceKr(subtotalOre, language)} />
      {stampCardDiscountOre > 0 ? (
        <SummaryRow
          label={t("stampCardCheckout.summaryRow")}
          value={`−${formatPriceKr(stampCardDiscountOre, language)}`}
          valueAccent
        />
      ) : null}
      {includedDrinkDiscountOre > 0 ? (
        <SummaryRow
          label={
            includedDrinkName
              ? `${t("goWell.title")} · ${includedDrinkName}`
              : t("goWell.summaryRow")
          }
          value={`−${formatPriceKr(includedDrinkDiscountOre, language)}`}
          valueAccent
        />
      ) : null}
      {coupon ? (
        <SummaryRow
          label={t("coupon.cartDiscountRow", { code: coupon.code, pct: coupon.percentage })}
          value={`−${formatPriceKr(discountAmountOre, language)}`}
          valueAccent
        />
      ) : null}
      <SummaryRow label={t("cart.summaryPickup")} value={t("cart.summaryFree")} valueMuted />
      {/* Patch 15: teaser only, placed with the PICKUP information and
          deliberately far from the payment buttons. It adds nothing to the
          order payload, no date or service picker, and never claims this
          order is a pre-order — see patch 14C. Not pressable. */}
      <View style={styles.preorderTeaser} accessibilityRole="text">
        <View style={styles.preorderBadge}>
          <ThemedText style={styles.preorderBadgeText}>
            {t("checkout.comingSoonBadge").toUpperCase()}
          </ThemedText>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText style={styles.preorderTitle}>{t("checkout.preorderTeaserTitle")}</ThemedText>
          <ThemedText variant="caption" style={styles.preorderBody}>
            {t("checkout.preorderTeaserBody")}
          </ThemedText>
        </View>
      </View>
      <SummaryRow label={t("cart.summaryTotal")} value={formatPriceKr(effectiveTotalOre, language)} isTotal />
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
  const { t } = useTranslation();
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
        <ThemedText style={styles.emptyHeading}>{t("cart.emptyHeading")}</ThemedText>
        <ThemedText style={styles.emptyText}>{t("cart.emptyText")}</ThemedText>
        <Pressable
          onPress={() => router.navigate("/(tabs)/meny")}
          style={({ pressed }) => [styles.emptyCta, pressed && { backgroundColor: colors.accentHover }]}
          accessibilityRole="button"
          accessibilityLabel={t("cart.emptyCta")}
        >
          <Menu size={14} color={colors.textPrimary} strokeWidth={1.75} />
          <ThemedText style={styles.emptyCtaText}>{t("cart.emptyCta")}</ThemedText>
        </Pressable>
      </View>
      <ThemedText style={styles.emptySubline}>{t("cart.emptySubline")}</ThemedText>
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
  switchBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  switchBox: {
    margin: spacing[4],
    marginBottom: spacing[8],
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing[4],
    gap: spacing[2],
  },
  switchTitle: { fontSize: 16, fontFamily: fontFamily.headlineSemibold, color: colors.textPrimary },
  switchBody: { fontSize: 12.5, lineHeight: 17.5, color: colors.textSecondary },
  switchActions: { flexDirection: "row", gap: spacing[2], marginTop: spacing[2] },
  switchSecondary: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchSecondaryLabel: { fontSize: 13, fontFamily: fontFamily.headlineSemibold, color: colors.textPrimary },
  switchPrimary: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.btn,
    backgroundColor: colors.accent,
  },
  switchPrimaryLabel: { fontSize: 13, fontFamily: fontFamily.headlineSemibold, color: colors.bg },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  // Patch 15 pre-order teaser — sits with the pickup row, never near the
  // payment controls.
  preorderTeaser: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  preorderBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  preorderBadgeText: {
    fontSize: 9,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.8,
    color: colors.accent,
  },
  preorderTitle: {
    fontSize: 12.5,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
  },
  preorderBody: { color: colors.textTertiary, lineHeight: 16, marginTop: 1 },
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
