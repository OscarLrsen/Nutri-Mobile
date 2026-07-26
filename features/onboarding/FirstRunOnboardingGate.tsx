import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { IntroCarousel } from "./IntroCarousel";
import { loadIntroSeen, markIntroSeen } from "./introStorage";
import { colors } from "@/theme";

/** If the storage read has not resolved within this window, fail open into
 * the app — a hanging storage layer must never stick the launch on a
 * covered screen (verification requirement 10). */
const READ_TIMEOUT_MS = 2000;

/**
 * First-run gate (patch 3): mounted in app/_layout.tsx ABOVE the Stack
 * (NutriSplashScreen layering pattern), so on the very first launch the
 * intro is what the splash fades into — the regular Home never flashes
 * first, because this cover is opaque from the first frame until the flag
 * is known:
 * - flag unknown  → plain background-colored cover (invisible behind the
 *   animated splash, which is still on top during boot),
 * - flag seen     → renders nothing,
 * - flag not seen → the IntroCarousel in first-run mode.
 *
 * State is written ONLY on deliberate user action (skip or the final
 * button — both land in onFinish). The local flip to "seen" happens
 * regardless of whether the write succeeds (introStorage's documented
 * fail-safe), so a broken disk can never trap anyone here.
 */
export function FirstRunOnboardingGate() {
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
