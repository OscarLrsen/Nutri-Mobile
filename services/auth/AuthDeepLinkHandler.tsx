import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";

import { supabase } from "./supabase";

/**
 * Turns an auth deep link back into a real session in THIS app.
 *
 * THE BUG THIS CLOSES. Registration used to hand Supabase an
 * `emailRedirectTo` pointing at the WEB app. The confirmation link therefore
 * opened Safari, the web app confirmed the account and set a session in the
 * BROWSER, and the phone was left on "Kolla din inkorg!" forever — the user
 * had to go back and log in by hand. The verification worked; the return
 * journey did not exist.
 *
 * WHY A LISTENER AND NOT A ROUTE. `app/_layout.tsx` wraps every screen in
 * `Stack.Protected`: signed out, only `logga-in` and `registrera` exist. A
 * route at `auth/callback` would be unreachable in exactly the state this
 * has to work in. A listener sits ABOVE the navigator, sets the session, and
 * the existing gate then flips to signed-in on its own — no route, no guard
 * change, no navigation code.
 *
 * WHAT ARRIVES. The web bridge (Nutri-Frontend `/auth/app`) forwards the
 * tokens Supabase produced, in the URL FRAGMENT:
 *
 *   nutri://auth/callback#access_token=…&refresh_token=…
 *
 * The fragment is deliberate: it is the one part of a URL that is never sent
 * to a server and never written to a server log. Query parameters are also
 * accepted, because Supabase's own `/auth/v1/verify` redirect has used both
 * shapes over time and a token that arrives the "wrong" way is still the
 * user's session — refusing it would strand them for no security gain.
 *
 * An `error`/`error_description` link (expired or already-used token) is
 * consumed silently: the registration screen keeps polling and shows its own
 * message. Never a crash, never a half-set session.
 */
export function AuthDeepLinkHandler() {
  // A confirmation link opened twice (cold start delivers the same URL to
  // both paths below) must not run setSession twice.
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const handleUrl = async (url: string | null) => {
      if (!active || !url) return;
      if (handledRef.current === url) return;

      const tokens = extractAuthTokens(url);
      if (!tokens) return;

      handledRef.current = url;
      const { error } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });

      if (error && __DEV__) {
        // Never log the tokens themselves — only that the exchange failed.
        console.warn("[auth] deep-link setSession failed:", error.message);
      }
      // Success needs no navigation: AuthProvider's onAuthStateChange fires,
      // RootNavigator's guard flips, and the app lands on Home by itself.
    };

    // Cold start: the app was launched BY the link.
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => {
        // No initial URL is the ordinary case, not an error.
      });

    // Warm start: the app was already running in the background.
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return null;
}

/**
 * Pulls an access/refresh token pair out of an auth deep link.
 *
 * Returns null for every URL that is not a complete token pair — a push
 * deep link, a plain `nutri://` open, an error link, or a half-formed URL.
 * Both halves are required: `setSession` with one of them produces a session
 * that cannot refresh and dies silently an hour later.
 */
export function extractAuthTokens(
  url: string,
): { accessToken: string; refreshToken: string } | null {
  if (!url) return null;

  const params = new URLSearchParams();
  const collect = (raw: string) => {
    if (!raw) return;
    for (const [key, value] of new URLSearchParams(raw)) {
      if (!params.has(key)) params.set(key, value);
    }
  };

  // Fragment first: that is where the bridge puts them, and where Supabase's
  // implicit flow puts them.
  const hashIndex = url.indexOf("#");
  if (hashIndex >= 0) collect(url.slice(hashIndex + 1));

  const queryIndex = url.indexOf("?");
  if (queryIndex >= 0) {
    const end = hashIndex > queryIndex ? hashIndex : url.length;
    collect(url.slice(queryIndex + 1, end));
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken };
}
