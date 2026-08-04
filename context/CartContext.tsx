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
import { useLanguage } from "@/i18n";
import { drinkName } from "@/features/menu/drinkText";
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

/**
 * A cart confirmation to render, carried as a translation KEY rather than a
 * finished sentence. Resolving it in the renderer is what lets a language
 * switch retranslate a toast that is already on screen, with no restart.
 *
 * `id` is monotonic: a repeat add replaces the visible toast and restarts its
 * timer instead of queueing another one, so hammering the add button can
 * never build a backlog of identical messages.
 */
/**
 * The messages the cart may raise. A closed union rather than `string`
 * because t() is typed against sv.json — a typo here is a build error, not a
 * raw key rendered to a customer.
 */
export type CartToastKey = "cart.toastAdded" | "cart.toastAddedNamed" | "cart.toastAddFailed";

export interface CartToastState {
  id: number;
  messageKey: CartToastKey;
  params?: Record<string, string>;
  variant: "success" | "error";
}

interface CartContextType {
  items: CartItem[];
  /** True once the AsyncStorage restore has completed (empty cart included). */
  hydrated: boolean;
  /** The cart confirmation to render, or null when nothing is showing. */
  toast: CartToastState | null;
  /** Dismisses the current toast (the renderer calls this when it times out). */
  dismissToast: () => void;
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
  /**
   * Adds a drink and shows the confirmation itself. Returns false — and adds
   * nothing, and shows an error instead of a success — when the drink is
   * unavailable or out of stock, so no caller can produce a confirmation for
   * an add that did not happen.
   */
  addDrinkItem: (drink: ApiDrink, quantity?: number) => boolean;
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

/** How long a cart confirmation stays on screen. */
const TOAST_MS = 2200;

/**
 * Stable per-line id sent to the backend as ClientLineId (patch 16C), so a
 * stamp card reward can point at exactly one cart line.
 *
 * Uses the same crypto.randomUUID-with-fallback the custom-meal id already
 * relies on. The fallback combines a timestamp with a random suffix rather
 * than random alone, so two lines created in the same millisecond still
 * differ — a collision here would mean discounting the wrong meal.
 */
function newClientLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();

  // The fallback must still be a REAL uuid: the backend column is a uuid, so
  // anything else fails the request, and the repair pass below would discard
  // it and mint a new id on every launch. Not cryptographically strong, which
  // does not matter — this only has to be unique within one cart.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * A line id the backend will actually accept. It rejects an all-zero guid and
 * anything that is not a uuid, so a cart carrying one would fail checkout with
 * an error the customer cannot act on — better to repair it on the way in.
 */
function isUsableClientLineId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    UUID_RE.test(value) &&
    value.toLowerCase() !== EMPTY_UUID
  );
}

/**
 * Repairs stored line ids exactly once, on hydrate.
 *
 * Fixes missing, blank, all-zero, non-uuid and DUPLICATE ids. Duplicates
 * matter most: two lines sharing an id make the reward ambiguous, and the
 * backend refuses rather than guessing — so the customer would be stuck until
 * they emptied the cart. Valid unique ids are preserved, because regenerating
 * them would silently invalidate a selection the customer already made.
 */
function repairClientLineIds(items: CartItem[]): CartItem[] {
  const seen = new Set<string>();
  return items.map((item) => {
    const current = item.clientLineId;
    if (isUsableClientLineId(current) && !seen.has(current)) {
      seen.add(current);
      return item;
    }
    let replacement = newClientLineId();
    while (seen.has(replacement)) replacement = newClientLineId();
    seen.add(replacement);
    return { ...item, clientLineId: replacement };
  });
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<CartToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastIdRef = useRef(0);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    setToast(null);
  }, []);

  /**
   * Replaces whatever is showing and restarts the timer — deliberately not a
   * queue. Repeated taps should confirm the latest add, not make the customer
   * sit through one toast per tap.
   */
  const showToast = useCallback(
    (
      messageKey: CartToastKey,
      params?: Record<string, string>,
      variant: "success" | "error" = "success"
    ) => {
      toastIdRef.current += 1;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ id: toastIdRef.current, messageKey, params, variant });
      toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
    },
    []
  );

  // A timer that outlives the provider would call setState on an unmounted
  // component; the provider is app-lifetime today, but that is not a reason
  // to leave the leak in place.
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

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
            // Migrations, applied once on hydrate. The persist effect below
            // writes the migrated cart straight back, so a stored cart is
            // upgraded exactly once rather than re-migrated every launch.
            //
            // - `kind`: items without it are meal items (pre-drink-upsell
            //   data) — the same migration the web applies on hydrate.
            // - `clientLineId`: carts stored before patch 16C have none.
            //   Assigning it here (not at checkout) is what makes the id
            //   stable — generating it per order attempt would hand the
            //   backend a different line id on every retry.
            setItems(
              repairClientLineIds(
                parsed.map((item: CartItem) => ({
                  ...item,
                  kind: item.kind ?? ("meal" as const),
                }))
              )
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
            clientLineId: newClientLineId(),
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

      // Meals deliberately do NOT raise the cart toast: MealCard already
      // confirms inline on the button itself, and stacking a second
      // confirmation on top of it was not asked for. The toast mechanism
      // below is shared and ready if that changes — this is a product
      // decision, not a missing wire-up.
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
    // Guard here rather than in the caller: this is the only place that can
    // promise the cart actually changed, so it is the only honest place to
    // decide between a success confirmation and an error. stockQuantity is
    // publicly obfuscated to 0/1 — compared, never displayed.
    if (!drink.isAvailable || drink.stockQuantity === 0) {
      showToast("cart.toastAddFailed", undefined, "error");
      return false;
    }

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
          clientLineId: newClientLineId(),
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

    // Queued in the same event as the setItems above, so React commits the
    // cart update and the confirmation together — the toast can never appear
    // ahead of the state it is confirming.
    showToast("cart.toastAddedNamed", { name: drinkName(drink, language) });
    return true;
  }, [language, showToast]);

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
        toast,
        dismissToast,
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
