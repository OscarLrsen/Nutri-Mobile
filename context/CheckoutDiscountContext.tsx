import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { ApiCoupon } from "@/services/api/coupons";
import { useAuth } from "@/services/auth/AuthProvider";
import { useCart } from "./CartContext";
import { useCoupon } from "./CouponContext";

/**
 * The ONE active discount on a checkout (patch 16C2).
 *
 * Only one reward may be used per order, and the backend rejects a request
 * carrying both a coupon and a stamp card reward. Modelling that as two
 * independent booleans invites exactly the bug the rule exists to prevent —
 * a coupon context saying one thing, a stamp card toggle saying another, and
 * a payload sending both. A tagged union makes "both selected" unrepresentable
 * rather than merely discouraged.
 *
 * Coupon selection stays in CouponContext, which owns its own persistence and
 * is used elsewhere; this wraps it rather than replacing it, so the change is
 * additive. The stamp card selection is deliberately NOT persisted: it names a
 * specific cart line and a specific reward, and a reward can be revoked,
 * reserved by another device or spent between sessions. Restoring a stale one
 * would show the customer a discount the server is about to refuse.
 */
export type CheckoutDiscount =
  | { type: "none" }
  | { type: "coupon"; coupon: ApiCoupon }
  | {
      type: "stamp-card";
      rewardId: string;
      /** Cart line the free meal applies to. */
      clientLineId: string;
      /** For copy only — the server decides the real amount. */
      mealName: string;
    };

interface CheckoutDiscountContextType {
  discount: CheckoutDiscount;
  /** Selects the stamp card, replacing any coupon. */
  selectStampCard: (selection: { rewardId: string; clientLineId: string; mealName: string }) => void;
  /** Selects a coupon, replacing any stamp card selection. */
  selectCoupon: (coupon: ApiCoupon) => void;
  clearDiscount: () => void;
  /** Drops only the stamp card — used when the server says it is no longer
   * valid, so a coupon selection is never collaterally cleared. */
  clearStampCard: () => void;
}

const CheckoutDiscountContext = createContext<CheckoutDiscountContextType | null>(null);

export function CheckoutDiscountProvider({ children }: { children: ReactNode }) {
  const { selectedCoupon, selectCoupon: setSelectedCoupon, clearSelectedCoupon } = useCoupon();
  const { items } = useCart();
  const { user } = useAuth();
  const [stampCard, setStampCard] = useState<
    { rewardId: string; clientLineId: string; mealName: string } | null
  >(null);

  // Drop the selection whenever the line it names stops existing — the cart
  // was cleared, the order went through, or the customer removed that meal.
  // Reducing its quantity does NOT clear it: the line is still there and the
  // reward still covers one portion of it.
  useEffect(() => {
    if (!stampCard) return;
    if (!items.some((i) => i.clientLineId === stampCard.clientLineId)) setStampCard(null);
  }, [items, stampCard]);

  // A reward belongs to one account. Signing out or switching user must not
  // leave the previous person's reward id armed in checkout.
  const userId = user?.id ?? null;
  useEffect(() => {
    setStampCard(null);
  }, [userId]);

  // The stamp card wins when both exist, which can only happen transiently:
  // every setter clears the other side, so the union always has one answer.
  const discount: CheckoutDiscount = useMemo(() => {
    if (stampCard) return { type: "stamp-card", ...stampCard };
    if (selectedCoupon) return { type: "coupon", coupon: selectedCoupon };
    return { type: "none" };
  }, [stampCard, selectedCoupon]);

  const selectStampCard = useCallback(
    (selection: { rewardId: string; clientLineId: string; mealName: string }) => {
      clearSelectedCoupon();
      setStampCard(selection);
    },
    [clearSelectedCoupon]
  );

  const selectCoupon = useCallback(
    (coupon: ApiCoupon) => {
      setStampCard(null);
      setSelectedCoupon(coupon);
    },
    [setSelectedCoupon]
  );

  const clearDiscount = useCallback(() => {
    setStampCard(null);
    clearSelectedCoupon();
  }, [clearSelectedCoupon]);

  const clearStampCard = useCallback(() => setStampCard(null), []);

  return (
    <CheckoutDiscountContext.Provider
      value={{ discount, selectStampCard, selectCoupon, clearDiscount, clearStampCard }}
    >
      {children}
    </CheckoutDiscountContext.Provider>
  );
}

export function useCheckoutDiscount() {
  const ctx = useContext(CheckoutDiscountContext);
  if (!ctx) throw new Error("useCheckoutDiscount must be used within CheckoutDiscountProvider");
  return ctx;
}
