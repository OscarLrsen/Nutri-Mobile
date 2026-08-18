import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/services/auth/supabase";
import { useAuth } from "@/services/auth/AuthProvider";

/**
 * The user's display NAME — never the e-mail address.
 *
 * Physical QA rule (hard): the full e-mail may never render as the
 * customer's name in the Home header. This hook therefore resolves to a
 * real name or to null — the CALLER chooses its neutral copy for null
 * ("Hej!" on Home, "Din profil" on Profil). Screens that legitimately show
 * the e-mail (account rows) read `user.email` directly where it belongs.
 *
 * Resolution order:
 *   1. `full_name` from the live session — the happy path, instant;
 *   2. the last known name for this user (device cache, written every time
 *      a real name is observed) — no flash for returning users;
 *   3. null — both while resolving AND when the account genuinely has no
 *      name (a one-shot `getUser()` self-heals stale session tokens whose
 *      metadata predates the name).
 */

const keyFor = (userId: string) => `nutri_display_name_v1:${userId}`;

export function useDisplayName(): string | null {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const metadataName =
    ((user?.user_metadata?.full_name as string | undefined) ?? "").trim() || null;

  const [cachedName, setCachedName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCachedName(null);
    if (!userId) return;
    AsyncStorage.getItem(keyFor(userId))
      .then((v) => {
        if (!cancelled && v) setCachedName(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Remember every real name we see, per user — the next cold start greets
  // correctly before any network round-trip.
  useEffect(() => {
    if (!userId || !metadataName) return;
    AsyncStorage.setItem(keyFor(userId), metadataName).catch(() => {});
  }, [userId, metadataName]);

  // Stale-JWT self-heal: no name in the session token → ask the server once.
  // getUser() does not rewrite the stored session, so a fresh name is
  // captured into the cache instead of waiting for the next token refresh.
  useEffect(() => {
    if (!userId || metadataName) return;
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
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, metadataName]);

  return metadataName ?? cachedName;
}
