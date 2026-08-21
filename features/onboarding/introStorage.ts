import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * First-run intro state — PER USER ACCOUNT.
 *
 * ── WHY v2 IS KEYED BY USER ──────────────────────────────────────────
 *
 * v1 was one flag for the whole installation. That is wrong for an
 * account-based app, and it produced a real defect: an account was
 * deleted and recreated with the same email, the new account got a new
 * user id, but the phone still held `nutri_intro_seen_v1 = "1"` from the
 * DELETED account — so the app decided this brand-new customer had
 * already been introduced and skipped straight to the welcome discount.
 * The same flag also let any second person signing in on the same phone
 * inherit the first person's onboarding.
 *
 * The two later first-login steps were already account-scoped (the
 * welcome flag is `nutri-welcome-coupon-prompted:<userId>`, the profile
 * prompt asks the backend), which is exactly why steps 2 and 3 appeared
 * for the new account and step 1 did not.
 *
 * v2 is therefore `nutri_intro_seen_v2:<userId>`. A new user id has no
 * flag and gets the intro — automatically, with no cleanup required
 * anywhere. That property is the point: deletion cleanup is a courtesy,
 * never the mechanism.
 *
 * ── THE LEGACY KEY ───────────────────────────────────────────────────
 *
 * v1 is kept READ-ONLY. It is never written again and never blanket-
 * migrated to a user — copying "this phone has seen the intro" onto every
 * account that signs in would reintroduce the exact bug. Whether a legacy
 * claim may be honoured for the CURRENT user is decided by server state
 * in introSeenRule.ts; this module only stores and reports.
 *
 * ── FAIL-SAFE STRATEGY (unchanged in spirit) ─────────────────────────
 * - READ failure → reported as "no flag", so the rule falls through to
 *   the server-state decision rather than silently claiming "seen".
 * - WRITE failure → swallowed; worst case the intro shows once more.
 * - A HANGING storage layer cannot stick the app on a covered screen —
 *   the read is raced against a timeout.
 */

/** Legacy, device-wide. Read-only: never written, never auto-migrated. */
export const LEGACY_INTRO_SEEN_KEY = "nutri_intro_seen_v1";

/** Per-user. `nutri_intro_seen_v2:<userId>`. */
export const INTRO_SEEN_KEY_PREFIX = "nutri_intro_seen_v2:";

export const introSeenKeyFor = (userId: string) => INTRO_SEEN_KEY_PREFIX + userId;

/**
 * If a read has not resolved within this window, stop waiting — a hanging
 * storage layer must never stick the launch on a covered screen
 * (verification requirement 10).
 */
export const INTRO_READ_TIMEOUT_MS = 2000;

/**
 * Read state, mirrored in memory so every consumer of the same user id
 * agrees instantly and nobody polls AsyncStorage.
 *
 * Keyed by user id — a value cached for user A must never answer for user
 * B. `undefined` (absent from the map) = not read yet for that user.
 */
const seenByUser = new Map<string, boolean>();
/** The legacy device-wide flag. null = not read yet this session. */
let legacySeen: boolean | null = null;
/** Users whose read timed out, so a late answer cannot flip them back. */
const timedOut = new Set<string>();

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeIntroSeen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** null = not read yet for this user (or no user). */
export function getIntroSeenCached(userId: string | null): boolean | null {
  if (!userId) return null;
  const v = seenByUser.get(userId);
  return v === undefined ? null : v;
}

/** null = the legacy flag has not been read yet this session. */
export function getLegacyIntroSeenCached(): boolean | null {
  return legacySeen;
}

async function readLegacy(): Promise<boolean> {
  try {
    const v = (await AsyncStorage.getItem(LEGACY_INTRO_SEEN_KEY)) === "1";
    legacySeen = v;
    return v;
  } catch {
    // Unreadable — treat as "no legacy claim". The server-state rule then
    // decides, which is strictly better than assuming this phone was
    // introduced under some other account.
    legacySeen = false;
    return false;
  }
}

async function readSeen(userId: string): Promise<boolean> {
  try {
    const v = (await AsyncStorage.getItem(introSeenKeyFor(userId))) === "1";
    if (!timedOut.has(userId)) seenByUser.set(userId, v);
    return v;
  } catch {
    // No flag for this user; the rule falls through to server state.
    if (!timedOut.has(userId)) seenByUser.set(userId, false);
    return false;
  }
}

/**
 * Read both flags for `userId`, racing a timeout so a hung disk cannot
 * hold the launch on a covered screen. Idempotent — several consumers
 * mounting at once still produce one answer they all share.
 */
export async function loadIntroSeen(userId: string): Promise<void> {
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      timedOut.add(userId);
      if (!seenByUser.has(userId)) seenByUser.set(userId, false);
      if (legacySeen === null) legacySeen = false;
      notify();
      resolve();
    }, INTRO_READ_TIMEOUT_MS);
  });
  await Promise.race([
    Promise.all([readSeen(userId), readLegacy()]).then(() => {
      notify();
    }),
    timeout,
  ]);
}

/** Record that THIS user has completed (or been credited with) the intro. */
export async function markIntroSeen(userId: string): Promise<void> {
  seenByUser.set(userId, true);
  notify();
  await AsyncStorage.setItem(introSeenKeyFor(userId), "1").catch(() => {});
}

/**
 * Drop one user's intro state — used when their account is deleted, so
 * nothing is left behind on the phone. Touches ONLY that user's key: the
 * legacy flag and every other account's flag are left alone.
 *
 * Deliberately not load-bearing. A recreated account gets a new user id
 * and therefore a fresh, absent flag whether or not this ever ran.
 */
export async function forgetIntroSeen(userId: string): Promise<void> {
  seenByUser.delete(userId);
  timedOut.delete(userId);
  notify();
  await AsyncStorage.removeItem(introSeenKeyFor(userId)).catch(() => {});
}
