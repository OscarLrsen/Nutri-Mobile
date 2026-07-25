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

export async function loadIntroSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INTRO_SEEN_KEY)) === "1";
  } catch {
    return true;
  }
}

export async function markIntroSeen(): Promise<void> {
  await AsyncStorage.setItem(INTRO_SEEN_KEY, "1").catch(() => {});
}
