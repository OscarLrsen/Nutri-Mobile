import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/services/auth/supabase";
import { useAuth } from "@/services/auth/AuthProvider";

/**
 * The user's display name WITHOUT the transient-email flash.
 *
 * deriveDisplayName's chain (full_name → email → fallback) is correct as a
 * FINAL answer, but rendering it immediately meant the Home greeting could
 * show the raw e-mail address whenever `user_metadata.full_name` was not in
 * the current session token yet — restored sessions carry the metadata from
 * when the JWT was minted, so a name added later only appears after a token
 * refresh. Rule: a real saved name must never lose to the e-mail, and the
 * e-mail may only show once we have genuinely settled on "no name exists".
 *
 * Resolution order:
 *   1. `full_name` from the live session — the happy path, instant;
 *   2. the last known name for this user (device cache, written every time
 *      a real name is observed) — kills the flash for returning users;
 *   3. while a one-shot `getUser()` refresh is in flight (stale-JWT
 *      self-heal), the caller's neutral fallback copy — NEVER the e-mail;
 *   4. only after the refresh settles with no name anywhere: the e-mail,
 *      which remains today's intended final fallback.
 */

const keyFor = (userId: string) => `nutri_display_name_v1:${userId}`;

export function useDisplayName(fallback: string): string {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const email = user?.email ?? null;
  const metadataName =
    ((user?.user_metadata?.full_name as string | undefined) ?? "").trim() || null;

  // undefined = cache not read yet; null = cache empty.
  const [cachedName, setCachedName] = useState<string | null | undefined>(undefined);
  const [refreshSettled, setRefreshSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCachedName(undefined);
    if (!userId) return;
    AsyncStorage.getItem(keyFor(userId))
      .then((v) => {
        if (!cancelled) setCachedName(v);
      })
      .catch(() => {
        if (!cancelled) setCachedName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Remember every real name we see, per user — the next cold start greets
  // correctly even before any network round-trip.
  useEffect(() => {
    if (!userId || !metadataName) return;
    AsyncStorage.setItem(keyFor(userId), metadataName).catch(() => {});
  }, [userId, metadataName]);

  // Stale-JWT self-heal: no name in the session token → ask the server once.
  // getUser() does not rewrite the stored session, so the fresh name is
  // captured into the cache instead of waiting for the next token refresh.
  useEffect(() => {
    setRefreshSettled(false);
    if (!userId || metadataName) {
      setRefreshSettled(true);
      return;
    }
    let cancelled = false;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        const fresh =
          ((data.user?.user_metadata?.full_name as string | undefined) ?? "").trim();
        if (fresh) {
          setCachedName(fresh);
          AsyncStorage.setItem(keyFor(userId), fresh).catch(() => {});
        }
        setRefreshSettled(true);
      })
      .catch(() => {
        if (!cancelled) setRefreshSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, metadataName]);

  if (metadataName) return metadataName;
  if (cachedName) return cachedName;
  if (cachedName === undefined || !refreshSettled) return fallback;
  return email || fallback;
}
