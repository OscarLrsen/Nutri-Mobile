import { supabase } from "./supabase";

/**
 * Resolves the current Supabase access token for attaching to an
 * authenticated backend request. Deliberately ports the exact resilience
 * pattern documented in Nutri-Frontend's `withAuth()` (spec §14.1/§17.4):
 *
 *   getSession() → if null, try refreshSession() → if still null,
 *   250ms backoff + re-read getSession() → if still null, throw.
 *
 * The web app's code comments explain this guards against a real observed
 * race (a browser tab briefly reporting no session while a token restores).
 * Whether the exact same race applies to a mobile Supabase client session
 * restore is unconfirmed (see spec §17.4/§23) — kept here defensively rather
 * than assumed necessary, since it's a correct no-op if the race doesn't
 * occur on mobile.
 *
 * Returns null (never throws) if no session can be resolved — callers
 * decide what "not authenticated" means for their request (see
 * services/api/client.ts's request interceptor).
 */
export async function getAccessToken(): Promise<string | null> {
  let { data } = await supabase.auth.getSession();

  if (!data.session) {
    try {
      const refreshed = await supabase.auth.refreshSession();
      data = { session: refreshed.data.session };
    } catch {
      // Refresh failed (e.g. no refresh token) — fall through to one more
      // read below before giving up, matching the web pattern exactly.
    }
  }

  if (!data.session) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const retry = await supabase.auth.getSession();
    data = retry.data;
  }

  return data.session?.access_token ?? null;
}
