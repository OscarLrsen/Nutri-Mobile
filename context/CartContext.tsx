import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CartItem, Meal, MealSlot } from "@/types/cart";
import type { ApiDrink } from "@/services/api/drinks";
import { MEAL_SIZES, previewMealPriceOre } from "@/utils/pricing";
import { normalizeMacroSnapshot } from "@/utils/macroMath";
import { getItemMacros, getItemWeightG } from "@/utils/cartMath";

/**
 * Cart store — a port of Nutri-Frontend's src/context/CartContext.tsx, NOT a
 * new implementation. Behavior (item id scheme, dedupe rules, drink wrapper,
 * quantity semantics, totalPrice öre-rounding split between fixed and
 * custom lines, "kind" migration on hydrate) is copied line-for-line; the
 * only intended difference is the storage medium: AsyncStorage (async)
 * instead of localStorage (sync), same key "nutri-cart", same JSON shape.
 *
 * Mobile additions on top of the web contract (documented, not guessed):
 * - `hydrated` is exposed so screens can avoid flashing the empty state
 *   during the async restore (localStorage needs no such flag).
 * - `updateSize` — in-cart size change (web has no in-cart size switch);
 *   follows the web id scheme, merging into an existing `${mealId}-${sizeId}`
 *   line when the target size is already in the cart.
 * - Read-only totals (cartCount/subtotalOre/totalOre/totalCalories/…)
 *   required by the Feature 4 contract; all derive from the web's own
 *   per-item formulas (see utils/cartMath.ts). totalPrice/totalItems keep
 *   their web names and web semantics (kr float / summed quantities).
 */

export type MealSize = "small" | "medium" | "large";

export const SIZE_MULTIPLIERS: Record<MealSize, number> = Object.fromEntries(
  MEAL_SIZES.map((s) => [s.id, s.priceMultiplier])
) as Record<MealSize, number>;

interface CartContextType {
  items: CartItem[];
  /** True once the AsyncStorage restore has completed (empty cart included). */
  hydrated: boolean;
  showToast: boolean;
  addItem: (
    meal: Meal,
    sizeId: string,
    quantity?: number,
    customMacros?: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number },
    customIngredients?: { ingredientId: string; name: string; amountG: number }[],
    ingredientSurchargeKr?: number,
    containerTypeId?: string,
    slot?: MealSlot,
    originalMealName?: string
  ) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateSize: (id: string, sizeId: string) => void;
  addDrinkItem: (drink: ApiDrink, quantity?: number) => void;
  updateDrinkQuantity: (drinkId: string, quantity: number) => void;
  clearCart: () => void;
  /** Kronor (float) — web-identical name and computation. */
  totalPrice: number;
  /** Summed quantities — web-identical name and computation. */
  totalItems: number;
  /** Alias for totalItems (Feature 4 contract name). */
  cartCount: number;
  /** totalPrice converted to öre for display through utils/money.formatPriceKr. */
  subtotalOre: number;
  /** = subtotalOre — pickup is free, same as the web summary (total = subtotal). */
  totalOre: number;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  /** Grams across all meal lines (drinks excluded — see utils/cartMath.ts). */
  totalWeightG: number;
}

const CartContext = createContext<CartContextType | null>(null);

/** Same storage key as the web's localStorage cart (spec §11.1/§22.7). */
const CART_KEY = "nutri-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore from AsyncStorage on mount — the async equivalent of the web's
  // after-mount localStorage read (which exists there to avoid SSR/hydration
  // mismatch; here it's simply because AsyncStorage is async).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CART_KEY);
        if (stored && mounted) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            // Migration: items without `kind` are meal items (pre-drink-upsell
            // data) — same migration the web applies on hydrate.
            setItems(
              parsed.map((item: CartItem) => ("kind" in item ? item : { ...item, kind: "meal" as const }))
            );
          }
        }
      } catch {
        // Invalid data — fall back to empty cart (web parity).
      }
      if (mounted) setHydrated(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Persist whenever items change (only after hydration, so the initial
  // empty state never overwrites a stored cart before the restore finishes).
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(CART_KEY, JSON.stringify(items)).catch(() => {
      // Storage full or unavailable — ignore (web parity).
    });
  }, [items, hydrated]);

  // Clear the toast timer on unmount so it can't fire into a dead tree.
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const addItem = useCallback(
    (
      meal: Meal,
      sizeId: string,
      quantity = 1,
      customMacros?: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number },
      customIngredients?: { ingredientId: string; name: string; amountG: number }[],
      ingredientSurchargeKr?: number,
      containerTypeId?: string,
      slot?: MealSlot,
      originalMealName?: string
    ) => {
      setItems((prev) => {
        const normalizedCustomMacros = customMacros ? normalizeMacroSnapshot(customMacros) : undefined;
        const isCustom = !!normalizedCustomMacros || !!customIngredients;
        const uniqueSuffix =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const id = isCustom ? `${meal.id}-custom-${uniqueSuffix}` : `${meal.id}-${sizeId}`;

        // For regular items, deduplicate by id (web parity).
        if (!isCustom) {
          const existing = prev.find((i) => i.id === id);
          if (existing) {
            return prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity + quantity } : i));
          }
        }

        return [
          ...prev,
          {
            id,
            meal,
            sizeId,
            quantity,
            isCustom,
            customMacros: normalizedCustomMacros,
            customIngredients,
            ingredientSurchargeKr,
            containerTypeId,
            slot,
            originalMealName,
          },
        ];
      });

      // Show toast for 4 seconds, reset timer if called again (web parity —
      // consumed by a future sticky-cart-bar port).
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setShowToast(true);
      toastTimerRef.current = setTimeout(() => setShowToast(false), 4000);
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback(
    (id: string, quantity: number) => {
      if (quantity <= 0) {
        removeItem(id);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)));
    },
    [removeItem]
  );

  // Mobile addition (no web counterpart — on web you remove and re-add to
  // change size). Regular meal lines only: drinks have no size and custom
  // lines have size-independent macros/pricing owned by their builder flow.
  const updateSize = useCallback((id: string, sizeId: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item || item.kind === "drink" || item.isCustom) return prev;
      if (item.sizeId === sizeId) return prev;
      const newId = `${item.meal.id}-${sizeId}`;
      const existing = prev.find((i) => i.id === newId);
      if (existing) {
        // Target size already in cart — merge quantities into it, keeping
        // the web's one-line-per-(meal,size) invariant.
        return prev
          .filter((i) => i.id !== id)
          .map((i) => (i.id === newId ? { ...i, quantity: i.quantity + item.quantity } : i));
      }
      return prev.map((i) => (i.id === id ? { ...i, id: newId, sizeId } : i));
    });
  }, []);

  const addDrinkItem = useCallback((drink: ApiDrink, quantity = 1) => {
    setItems((prev) => {
      const id = `drink-${drink.id}`;
      const existing = prev.find((i) => i.id === id);
      if (existing) {
        return prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity + quantity } : i));
      }
      return [
        ...prev,
        {
          id,
          kind: "drink" as const,
          drink,
          // Synthetic Meal wrapper — byte-for-byte the same mapping the web
          // uses so a drink line serializes identically on both platforms.
          meal: {
            id: drink.id,
            name: drink.name,
            description: drink.description,
            image: drink.image || "",
            basePrice: Math.round(drink.priceOre / 100),
            category: drink.category,
            available: drink.isAvailable,
            macros: { calories: drink.calories, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
            ingredients: [],
            sizes: [],
          },
          sizeId: "medium",
          quantity,
          isCustom: false,
        },
      ];
    });
  }, []);

  const updateDrinkQuantity = useCallback(
    (drinkId: string, quantity: number) => {
      updateQuantity(`drink-${drinkId}`, quantity);
    },
    [updateQuantity]
  );

  const clearCart = useCallback(() => setItems([]), []);

  // Web-identical totals. Fixed meals (no custom builder, no surcharge) use
  // the backend's whole-SEK öre rounding so the cart total matches
  // LineTotalOre on the receipt; custom lines keep the float approximation —
  // backend recomputes pricing for those flows.
  const totalPrice = items.reduce((sum, item) => {
    if (item.kind === "drink" && item.drink) {
      return sum + (item.drink.priceOre / 100) * item.quantity;
    }
    const size = MEAL_SIZES.find((s) => s.id === item.sizeId);
    const multiplier = size?.priceMultiplier ?? 1;
    const surcharge = item.ingredientSurchargeKr ?? 0;
    if (!item.isCustom && surcharge === 0) {
      return sum + (previewMealPriceOre(item.meal.basePrice, multiplier) * item.quantity) / 100;
    }
    return sum + (item.meal.basePrice * multiplier + surcharge) * item.quantity;
  }, 0);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const derivedTotals = useMemo(() => {
    const macro = items.reduce(
      (acc, item) => {
        const m = getItemMacros(item);
        return {
          kcal: acc.kcal + m.kcal,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fat: acc.fat + m.fat,
          fiber: acc.fiber + m.fiber,
        };
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
    const weightG = items.reduce((sum, item) => sum + getItemWeightG(item), 0);
    return { macro, weightG };
  }, [items]);

  const subtotalOre = Math.round(totalPrice * 100);

  return (
    <CartContext.Provider
      value={{
        items,
        hydrated,
        showToast,
        addItem,
        removeItem,
        updateQuantity,
        updateSize,
        addDrinkItem,
        updateDrinkQuantity,
        clearCart,
        totalPrice,
        totalItems,
        cartCount: totalItems,
        subtotalOre,
        // Pickup is free — the web summary renders total = subtotal.
        totalOre: subtotalOre,
        totalCalories: derivedTotals.macro.kcal,
        totalProtein: derivedTotals.macro.protein,
        totalCarbs: derivedTotals.macro.carbs,
        totalFat: derivedTotals.macro.fat,
        totalFiber: derivedTotals.macro.fiber,
        totalWeightG: derivedTotals.weightG,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
