import { useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/services/auth/AuthProvider";
import {
  getIntroSeenCached,
  getLegacyIntroSeenCached,
  loadIntroSeen,
  markIntroSeen,
  subscribeIntroSeen,
} from "./introStorage";
import { deriveIntroSeen } from "./introSeenRule";
import { useNutritionProfileGate } from "./useNutritionProfileGate";

/** Users already credited this session, so the write happens once. */
const persisted = new Set<string>();

/**
 * "Has the CURRENT user seen the intro?" — three-valued; `null` until the
 * answer is genuinely known, so nothing downstream ever guesses.
 *
 * ACCOUNT-SCOPED. A different user id is a different answer, which is what
 * stops a recreated — or simply a second — account on the same phone from
 * inheriting the previous person's onboarding. The legacy device-wide flag
 * is adjudicated against server state by deriveIntroSeen rather than
 * copied across; see introSeenRule.ts for why copying is the trap.
 *
 * The profile gate rides the shared ["nutrition","today"] row the app
 * already mounts, so this adds no request.
 */
export function useIntroSeen(): boolean | null {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { status: profileGate } = useNutritionProfileGate();

  const storedSeen = useSyncExternalStore(
    subscribeIntroSeen,
    () => getIntroSeenCached(userId),
    () => getIntroSeenCached(userId)
  );
  const legacySeen = useSyncExternalStore(
    subscribeIntroSeen,
    getLegacyIntroSeenCached,
    getLegacyIntroSeenCached
  );

  // Kick the read for whoever is signed in NOW. Idempotent, and it re-runs
  // on a user switch so the next account reads its own key rather than
  // answering from the previous one's cached value.
  useEffect(() => {
    if (!userId) return;
    if (getIntroSeenCached(userId) === null) void loadIntroSeen(userId);
  }, [userId]);

  const decision = userId
    ? deriveIntroSeen({ storedSeen, legacySeen, profileGate })
    : { seen: null, persist: false };

  // Pin a legacy claim that server state has just justified, so this
  // account is decided once and never re-adjudicated.
  useEffect(() => {
    if (!userId || !decision.persist || persisted.has(userId)) return;
    persisted.add(userId);
    void markIntroSeen(userId);
  }, [userId, decision.persist]);

  return decision.seen;
}
