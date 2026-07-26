import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * First-run intro flag (patch 3). VERSIONED key — bump the suffix only if
 * the intro changes so fundamentally that every existing user should see
 * it again. Naming follows utils/activeOrder.ts (nutri_ prefix).
 *
 * Fail-safe strategy (documented launch decision):
 * - READ failure → treated as SEEN: a storage problem must let the user
 *   into the app, never trap them in (or keep re-showing) the intro.
 * - WRITE failure → swallowed: navigation proceeds normally; worst case
 *   the intro shows once more on the next cold start.
 * - The gate additionally races the read against a timeout, so even a
 *   HANGING storage layer cannot stick the app on a covered screen.
 */
export const INTRO_SEEN_KEY = "nutri_intro_seen_v1";

// In-memory mirror + subscription (additive, patch 4): other app-level
// overlays (the onboarding survey) must never show WHILE the first-run
// intro is up, so they subscribe here instead of polling AsyncStorage.
// null = not read yet this session. The first-run decision logic above is
// untouched — this only broadcasts what it already reads/writes.
let cachedSeen: boolean | null = null;
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((listener) => listener());
}

export function getIntroSeenCached(): boolean | null {
  return cachedSeen;
}

export function subscribeIntroSeen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadIntroSeen(): Promise<boolean> {
  try {
    const seen = (await AsyncStorage.getItem(INTRO_SEEN_KEY)) === "1";
    cachedSeen = seen;
    notify();
    return seen;
  } catch {
    cachedSeen = true;
    notify();
    return true;
  }
}

export async function markIntroSeen(): Promise<void> {
  cachedSeen = true;
  notify();
  await AsyncStorage.setItem(INTRO_SEEN_KEY, "1").catch(() => {});
}
