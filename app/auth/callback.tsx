import { useEffect, useState, useSyncExternalStore } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import {
  isAuthLinkInFlight,
  subscribeAuthLinkActivity,
} from "@/services/auth/authLinkActivity";
import { useTranslation } from "@/i18n";
import { colors, spacing } from "@/theme";

/**
 * The landing route for `nutri://auth/callback`.
 *
 * WHY IT EXISTS. AuthDeepLinkHandler consumes the tokens above the
 * navigator, so no route is needed to make the session work — but Expo
 * Router still resolves the link's PATH. With nothing at `auth/callback` it
 * rendered `+not-found`, so the session was being established behind a 404.
 *
 * WHY IT MUST BE ABLE TO LEAVE. This route sits outside both
 * Stack.Protected groups so the link resolves whether the customer is
 * signed in or out. That makes it PERMANENTLY AVAILABLE, and an
 * always-available route is one the navigator can fall back to. It did:
 * after account deletion (and after any ordinary sign-out) every guarded
 * screen was dropped and the navigator landed on the first one still
 * standing — this one — leaving the app on "Signing you in…" with nothing
 * to sign in. The navigator's own contract is that such a fallback lands on
 * login; this screen had quietly taken that place.
 *
 * So it now renders ONLY while a real exchange is in flight, and otherwise
 * sends the customer where they belong:
 *
 *   a session exists      → into the app
 *   nothing in flight     → login  (the fallback case, and a stale link)
 *   in flight too long    → login  (a token that never resolves)
 *
 * It still performs no auth of its own — one place owns that, and it is the
 * handler.
 */

/**
 * How long to wait for the handler to announce itself before deciding
 * nothing is happening. On a cold start this screen can mount before
 * `getInitialURL()` resolves, so leaving immediately would abandon a real
 * confirmation.
 */
const START_GRACE_MS = 1200;

/** An exchange that never finishes must not strand the customer either. */
const MAX_WAIT_MS = 10_000;

export default function AuthCallbackScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading } = useAuth();
  const linkInFlight = useSyncExternalStore(subscribeAuthLinkActivity, isAuthLinkInFlight);

  // Flips once the grace period has passed, so "nothing in flight" can be
  // told apart from "the handler has not started yet".
  const [graceOver, setGraceOver] = useState(false);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    const grace = setTimeout(() => setGraceOver(true), START_GRACE_MS);
    const cap = setTimeout(() => setWaitedTooLong(true), MAX_WAIT_MS);
    return () => {
      clearTimeout(grace);
      clearTimeout(cap);
    };
  }, []);

  useEffect(() => {
    // Auth state is still being read from storage — decide nothing yet.
    if (loading) return;

    if (user) {
      // The exchange worked (or the customer was already signed in and
      // arrived here some other way). This route is outside the guards, so
      // it is NOT removed when the session lands — nothing would move the
      // app off it unless this does.
      router.replace("/(tabs)");
      return;
    }

    // No session, and either nothing was ever being processed or it has had
    // long enough. Both mean the same thing to the customer.
    if ((graceOver && !linkInFlight) || waitedTooLong) {
      router.replace("/logga-in");
    }
  }, [user, loading, linkInFlight, graceOver, waitedTooLong, router]);

  return (
    <View style={styles.container}>
      <LoadingIndicator />
      <ThemedText style={styles.text}>{t("auth.completingSignIn")}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[4],
    backgroundColor: colors.bg,
    paddingHorizontal: spacing[6],
  },
  text: {
    fontSize: 14,
    textAlign: "center",
    color: colors.textSecondary,
  },
});
