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

/**
 * If the storage read has not resolved within this window, fail open into
 * the app — a hanging storage layer must never stick the launch on a
 * covered screen (verification requirement 10).
 */
export const INTRO_READ_TIMEOUT_MS = 2000;

/** Set once the timeout below has fired, so a read that arrives afterwards
 * cannot pull the app BACK into an intro it already let the user past. */
let failedOpen = false;

export async function loadIntroSeen(): Promise<boolean> {
  try {
    const seen = (await AsyncStorage.getItem(INTRO_SEEN_KEY)) === "1";
    if (!failedOpen) {
      cachedSeen = seen;
      notify();
    }
    return seen;
  } catch {
    cachedSeen = true;
    notify();
    return true;
  }
}

/**
 * The read every first-login consumer must use. Shared rather than
 * duplicated: the first-run gate used to race this timeout privately and
 * commit to "seen" in its own local state, leaving the in-memory mirror
 * `null` forever. Anything else waiting on the intro — the first-login
 * order machine — then waited for a signal that was never coming, so a
 * hung disk would silently swallow the welcome discount AND the profile
 * prompt. One read, one timeout, one answer, broadcast to everyone.
 */
export function loadIntroSeenWithTimeout(): Promise<boolean> {
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      failedOpen = true;
      if (cachedSeen === null) {
        cachedSeen = true;
        notify();
      }
      resolve(true);
    }, INTRO_READ_TIMEOUT_MS);
  });
  return Promise.race([loadIntroSeen(), timeout]);
}

export async function markIntroSeen(): Promise<void> {
  cachedSeen = true;
  notify();
  await AsyncStorage.setItem(INTRO_SEEN_KEY, "1").catch(() => {});
}
