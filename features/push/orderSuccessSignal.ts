import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * One-shot "an order was just successfully placed FROM THIS INSTALLATION"
 * signal (patch 10). The push pre-prompt must only appear after the user's
 * first successful order — never on historical or already-running orders
 * that merely become visible when this app version installs. The cart's
 * order-success path stamps the created order's id here; the pre-prompt
 * card shows only on THAT order's screen.
 *
 * Versioned key, nutri_ prefix (introStorage naming). All storage failures
 * are swallowed — this signal must never block ordering or the order view.
 */
export const PUSH_ORDER_SUCCESS_KEY = "nutri_push_order_success_v1";

/** Fire-and-forget — called from the cart right after the backend confirms
 * the order was created. Deliberately not awaited by callers. */
export function markOrderSuccessForPushPreprompt(orderId: number | string): void {
  AsyncStorage.setItem(PUSH_ORDER_SUCCESS_KEY, String(orderId)).catch(() => {});
}

/** The order id stamped by the last successful in-app order, or null. */
export async function getOrderSuccessSignal(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_ORDER_SUCCESS_KEY);
  } catch {
    return null;
  }
}

/** Cleanup once the pre-prompt has been handled (shown or dismissed). */
export function clearOrderSuccessSignal(): void {
  AsyncStorage.removeItem(PUSH_ORDER_SUCCESS_KEY).catch(() => {});
}
