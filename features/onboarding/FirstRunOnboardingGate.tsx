import { StyleSheet, View } from "react-native";

import { IntroCarousel } from "./IntroCarousel";
import { markIntroSeen } from "./introStorage";
import { useIntroSeen } from "./useIntroSeen";
import { useAuth } from "@/services/auth/AuthProvider";
import { colors } from "@/theme";

/**
 * First-run gate (patch 3, reordered by patch 11): mounted in
 * app/_layout.tsx ABOVE the Stack (NutriSplashScreen layering pattern).
 *
 * SESSION-GATED (patch 11 locked order): login is always the first usable
 * screen on a signed-out installation, so this gate renders NOTHING
 * without a valid session — the auth gate's login screen owns that state.
 * The intro instead appears right AFTER the first successful sign-in /
 * registration for an ACCOUNT that hasn't seen it, and right after every
 * later sign-in until that account has completed it once. Per account,
 * not per phone: a deleted-and-recreated login is a new user id and gets
 * its own intro, and a second person signing in here never inherits the
 * first person's. The full order is:
 * login → session → consent gate (an RN Modal, always stacks above this
 * View) → intro → survey (subscribes to the intro-seen signal) → Home.
 *
 * For a signed-in user the cover behaviour is as before:
 * - flag unknown  → plain background-colored cover (no Home flash),
 * - flag seen     → renders nothing,
 * - flag not seen → the IntroCarousel in first-run mode.
 *
 * State is written ONLY on deliberate user action (skip or the final
 * button — both land in onFinish). The local flip to "seen" happens
 * regardless of whether the write succeeds (introStorage's documented
 * fail-safe), so a broken disk can never trap anyone here. Auth/storage
 * failures degrade to the safe state: no session → login; hung flag read
 * → timeout fails open into the app.
 */
export function FirstRunOnboardingGate() {
  const { user, loading } = useAuth();
  // The SHARED read (introStorage), not a private one. This gate is step 1
  // of the first-login order, and steps 2 and 3 wait on the same signal —
  // so "the intro is done" has to be one fact, not this component's
  // private opinion. Timeout/fail-open semantics live in introStorage.
  const seen = useIntroSeen();

  // No valid session → login owns the screen (patch 11). Rendering null
  // here also means logout instantly drops any visible intro.
  if (loading || !user) return null;

  if (seen === true) return null;

  if (seen === null) {
    return <View style={[StyleSheet.absoluteFill, styles.cover]} />;
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <IntroCarousel
        mode="first-run"
        onFinish={() => {
          // Credited to THIS user id. Flips the shared mirror
          // synchronously and notifies every subscriber, so step 2 becomes
          // eligible the same instant this cover disappears — no gap where
          // nothing is showing.
          void markIntroSeen(user.id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { backgroundColor: colors.bg },
});
