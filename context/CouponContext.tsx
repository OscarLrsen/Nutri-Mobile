import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ApiCoupon } from "@/services/api/coupons";

/**
 * Selected-coupon store — which of the user's coupons should be attached to
 * the next order (CreateOrderDto.CouponId). Mobile-only state with no web
 * counterpart yet (the coupon feature ships on mobile first); persistence
 * follows CartContext's AsyncStorage pattern (hydrate once on mount, persist
 * after hydration) so a selected coupon survives an app restart the same way
 * the cart does.
 *
 * The stored value is the full ApiCoupon snapshot, not just the id, so the
 * cart can render code/percentage without a refetch. It may go stale (used
 * from another device, expired overnight) — that's fine: the CartScreen
 * reconciles it against the fresh GET /api/coupons result, and the backend
 * validates authoritatively at order time regardless.
 */
interface CouponContextType {
  /** Coupon to send as couponId on the next order, or null. */
  selectedCoupon: ApiCoupon | null;
  /** True once the AsyncStorage restore has completed. */
  hydrated: boolean;
  selectCoupon: (coupon: ApiCoupon) => void;
  clearSelectedCoupon: () => void;
}

const CouponContext = createContext<CouponContextType | null>(null);

const SELECTED_COUPON_KEY = "nutri-selected-coupon";

export function CouponProvider({ children }: { children: ReactNode }) {
  const [selectedCoupon, setSelectedCoupon] = useState<ApiCoupon | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(SELECTED_COUPON_KEY);
        if (stored && mounted) {
          const parsed = JSON.parse(stored);
          // Minimal shape check — bad data falls back to "nothing selected".
          if (parsed && typeof parsed === "object" && typeof parsed.id === "string") {
            setSelectedCoupon(parsed as ApiCoupon);
          }
        }
      } catch {
        // Invalid data — fall back to no selection (CartContext parity).
      }
      if (mounted) setHydrated(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (selectedCoupon) {
      AsyncStorage.setItem(SELECTED_COUPON_KEY, JSON.stringify(selectedCoupon)).catch(() => {
        // Storage full or unavailable — ignore (CartContext parity).
      });
    } else {
      AsyncStorage.removeItem(SELECTED_COUPON_KEY).catch(() => {});
    }
  }, [selectedCoupon, hydrated]);

  const selectCoupon = useCallback((coupon: ApiCoupon) => setSelectedCoupon(coupon), []);
  const clearSelectedCoupon = useCallback(() => setSelectedCoupon(null), []);

  return (
    <CouponContext.Provider value={{ selectedCoupon, hydrated, selectCoupon, clearSelectedCoupon }}>
      {children}
    </CouponContext.Provider>
  );
}

export function useCoupon() {
  const context = useContext(CouponContext);
  if (!context) {
    throw new Error("useCoupon must be used within a CouponProvider");
  }
  return context;
}
