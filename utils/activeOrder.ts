import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Active-order bookkeeping, ported from the web's ActiveOrderBar constants
 * (localStorage["nutri_active_order_id"]) — same key, AsyncStorage medium.
 * The web writes this right before navigating to /order/[id] (pay_on_site)
 * or right before starting a Stripe Checkout session, so a failure after
 * order creation never loses the order id.
 */
export const ACTIVE_ORDER_KEY = "nutri_active_order_id";

/**
 * Mobile-only adaptation flag: the web clears the cart on the order page via
 * the `?stripe=success` URL param, which mobile can never receive (the
 * Stripe redirect lands in the external browser on the WEB app). Instead the
 * cart stores the order id it started a Stripe checkout for; the order
 * screen clears the cart once — and only — when THAT order reports Paid.
 */
export const PENDING_STRIPE_CLEAR_KEY = "nutri_pending_stripe_clear";

export async function setActiveOrderId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_ORDER_KEY, id).catch(() => {});
}

export async function getActiveOrderId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_ORDER_KEY);
  } catch {
    return null;
  }
}

export async function setPendingStripeClear(orderId: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_STRIPE_CLEAR_KEY, orderId).catch(() => {});
}

export async function consumePendingStripeClear(orderId: string): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(PENDING_STRIPE_CLEAR_KEY);
    if (stored !== orderId) return false;
    await AsyncStorage.removeItem(PENDING_STRIPE_CLEAR_KEY);
    return true;
  } catch {
    return false;
  }
}
