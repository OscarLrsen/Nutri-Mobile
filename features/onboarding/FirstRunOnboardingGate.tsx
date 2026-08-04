import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { IntroCarousel } from "./IntroCarousel";
import { loadIntroSeen, markIntroSeen } from "./introStorage";
import { useAuth } from "@/services/auth/AuthProvider";
import { colors } from "@/theme";

/** If the storage read has not resolved within this window, fail open into
 * the app — a hanging storage layer must never stick the launch on a
 * covered screen (verification requirement 10). */
const READ_TIMEOUT_MS = 2000;

/**
 * First-run gate (patch 3, reordered by patch 11): mounted in
 * app/_layout.tsx ABOVE the Stack (NutriSplashScreen layering pattern).
 *
 * SESSION-GATED (patch 11 locked order): login is always the first usable
 * screen on a signed-out installation, so this gate renders NOTHING
 * without a valid session — the auth gate's login screen owns that state.
 * The intro instead appears right AFTER the first successful sign-in /
 * registration on an installation that hasn't seen it (the local
 * versioned flag is unchanged), and right after every later sign-in
 * until it has been completed once. The full order is:
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
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const timeout = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), READ_TIMEOUT_MS);
    });
    void Promise.race([loadIntroSeen(), timeout]).then((value) => {
      if (active) setSeen(value);
    });
    return () => {
      active = false;
    };
  }, []);

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
          void markIntroSeen();
          setSeen(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { backgroundColor: colors.bg },
});
