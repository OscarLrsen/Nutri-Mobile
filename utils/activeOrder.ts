import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The id of the order the customer is currently following.
 *
 * Ported from the web's ActiveOrderBar constants
 * (localStorage["nutri_active_order_id"]) — same key, AsyncStorage medium.
 * The web writes this right before navigating to /order/[id] (pay_on_site) or
 * right before starting a Stripe Checkout session, so a failure after order
 * creation never loses the order id.
 *
 * WHY THIS IS A STORE AND NOT JUST AsyncStorage.
 * The banner reads this from screens that are ALREADY MOUNTED — Hem, Meny and
 * Profil stay alive in the tab navigator once visited. A plain
 * `getActiveOrderId()` inside a mount effect therefore answered "no order"
 * once, at app start, and never learned that checkout had created one a minute
 * later. That is exactly the reported bug: place an order, leave the status
 * screen, and the banner is missing everywhere until the app restarts.
 *
 * So writes NOTIFY. set/clear update an in-memory value and wake every
 * subscriber; AsyncStorage remains the durability layer for cold starts. One
 * source of truth, and it is live.
 */

export const ACTIVE_ORDER_KEY = "nutri_active_order_id";
export const PENDING_STRIPE_CLEAR_KEY = "nutri_pending_stripe_clear";

/** `undefined` = storage not read yet, `null` = read and there is none. */
type Snapshot = string | null | undefined;

let cached: Snapshot = undefined;
let loading = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function load() {
  if (cached !== undefined || loading) return;
  loading = true;
  AsyncStorage.getItem(ACTIVE_ORDER_KEY)
    .then((stored) => {
      cached = stored ?? null;
    })
    .catch(() => {
      cached = null;
    })
    .finally(() => {
      loading = false;
      emit();
    });
}

export function subscribeActiveOrderId(listener: () => void): () => void {
  listeners.add(listener);
  load();
  return () => {
    listeners.delete(listener);
  };
}

/** Stable primitive — safe as a useSyncExternalStore snapshot. */
export function getActiveOrderIdSnapshot(): Snapshot {
  return cached;
}

export async function setActiveOrderId(id: string): Promise<void> {
  cached = id;
  emit();
  await AsyncStorage.setItem(ACTIVE_ORDER_KEY, id).catch(() => {});
}

export async function getActiveOrderId(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_ORDER_KEY);
    cached = stored ?? null;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export async function clearActiveOrderId(): Promise<void> {
  cached = null;
  emit();
  await AsyncStorage.removeItem(ACTIVE_ORDER_KEY).catch(() => {});
}

/**
 * Sign-out / account switch. Drops the id from memory AND storage so the next
 * account can never inherit the previous customer's order — the in-memory copy
 * matters here, because a mounted banner would otherwise keep rendering it.
 */
export async function resetActiveOrderForAccountChange(): Promise<void> {
  cached = null;
  emit();
  await AsyncStorage.multiRemove([ACTIVE_ORDER_KEY, PENDING_STRIPE_CLEAR_KEY]).catch(() => {});
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
