import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

import { useLanguage } from "@/i18n";
import { useAuth } from "@/services/auth/AuthProvider";
import { colors, fontFamily } from "@/theme";

/**
 * Animated startup screen, rendered on top of the app while it finishes
 * booting. The native splash (same leaf asset, same #0B0B0B background,
 * imageWidth 120) is hidden on this component's first layout, at which point
 * the leaf here sits at scale 0.96 → 125 × 0.96 = 120px — a seamless
 * takeover with no visible jump. The orange shapes and the NUTRI wordmark
 * then fade in, the leaf settles to full size and breathes gently until the
 * app is ready, and the whole overlay fades away.
 *
 * Dismissal is driven by real readiness (auth hydration + language
 * hydration; fonts are already loaded before this can mount), clamped to a
 * minimum visible time so it never blinks past, and capped by a hard
 * failsafe so it can never block the app permanently.
 */

const MIN_VISIBLE_MS = 900;
const MAX_WAIT_MS = 6000;
const EXIT_MS = 280;

// Native splash leaf = imageWidth 120; here 125 × entrance-scale 0.96 = 120.
const LOGO_WIDTH = 125;
// splash-icon.png is 909 × 806 (leaf cropped to its bounding box + margin).
const LOGO_HEIGHT = Math.round(LOGO_WIDTH * (806 / 909));

interface NutriSplashScreenProps {
  /** False when font loading failed — the wordmark falls back to system font. */
  brandFontAvailable: boolean;
  /** Called once the exit fade has finished; the parent unmounts the overlay. */
  onDone: () => void;
}

export function NutriSplashScreen({ brandFontAvailable, onDone }: NutriSplashScreenProps) {
  const { loading: authLoading } = useAuth();
  const { isReady: languageReady } = useLanguage();
  const appReady = !authLoading && languageReady;

  // null until the OS setting has been read — animations wait for it.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  const rootOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.96)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const blobsOpacity = useRef(new Animated.Value(0)).current;
  const blob1Drift = useRef(new Animated.Value(0)).current;
  const blob2Drift = useRef(new Animated.Value(0)).current;

  const mountedAtRef = useRef(Date.now());
  const nativeHiddenRef = useRef(false);
  const exitStartedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // The native splash comes down only after this overlay has laid out, so
  // there is never a frame without the leaf on screen.
  const handleLayout = () => {
    if (nativeHiddenRef.current) return;
    nativeHiddenRef.current = true;
    SplashScreen.hideAsync().catch(() => {
      // Already hidden or unsupported (e.g. web) — safe to ignore.
    });
  };

  // Resolve the OS Reduce Motion setting.
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {
        if (active) setReduceMotion(false);
      });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      if (active) setReduceMotion(enabled);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  // Entrance + idle animations, started once Reduce Motion is known.
  useEffect(() => {
    if (reduceMotion === null) return;
    const animations: Animated.CompositeAnimation[] = [];
    const start = (a: Animated.CompositeAnimation) => {
      animations.push(a);
      a.start();
    };

    if (reduceMotion) {
      // Same design, single short fade, no continuous motion.
      logoScale.setValue(1);
      start(
        Animated.parallel([
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(blobsOpacity, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
        ])
      );
    } else {
      // Leaf settles from the native-splash size, wordmark and shapes fade in.
      start(
        Animated.parallel([
          Animated.timing(logoScale, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 450,
            delay: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(blobsOpacity, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      // Calm "breathing": 1.0 → 1.015, slow, no blink.
      start(
        Animated.loop(
          Animated.sequence([
            Animated.timing(logoScale, {
              toValue: 1.015,
              duration: 2600,
              delay: 500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(logoScale, {
              toValue: 1,
              duration: 2600,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        )
      );
      // Very slow drift of the orange shapes — a few px, never leaving
      // their corner anchoring.
      start(
        Animated.loop(
          Animated.sequence([
            Animated.timing(blob1Drift, {
              toValue: 1,
              duration: 7000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(blob1Drift, {
              toValue: 0,
              duration: 7000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        )
      );
      start(
        Animated.loop(
          Animated.sequence([
            Animated.timing(blob2Drift, {
              toValue: 1,
              duration: 9000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(blob2Drift, {
              toValue: 0,
              duration: 9000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        )
      );
    }

    return () => {
      for (const a of animations) a.stop();
    };
  }, [reduceMotion, logoScale, textOpacity, blobsOpacity, blob1Drift, blob2Drift]);

  // Exit: when the app is ready and the minimum visible time has passed —
  // or unconditionally at the failsafe deadline.
  useEffect(() => {
    const startExit = () => {
      if (exitStartedRef.current) return;
      exitStartedRef.current = true;
      Animated.timing(rootOpacity, {
        toValue: 0,
        duration: EXIT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        onDoneRef.current();
      });
    };

    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    if (appReady) {
      const elapsed = Date.now() - mountedAtRef.current;
      readyTimer = setTimeout(startExit, Math.max(0, MIN_VISIBLE_MS - elapsed));
    }
    const failsafeTimer = setTimeout(() => {
      if (!exitStartedRef.current && __DEV__) {
        console.warn(
          "[NutriSplashScreen] Startup not ready within " +
            `${MAX_WAIT_MS}ms — showing the app anyway.`
        );
      }
      startExit();
    }, MAX_WAIT_MS - (Date.now() - mountedAtRef.current));

    return () => {
      if (readyTimer) clearTimeout(readyTimer);
      clearTimeout(failsafeTimer);
    };
  }, [appReady, rootOpacity]);

  return (
    <Animated.View style={[styles.root, { opacity: rootOpacity }]} onLayout={handleLayout}>
      {/* Black background during launch — light status bar content, popped
          automatically when the overlay unmounts. */}
      <StatusBar style="light" />

      {/* Top-left orange shape, partially offscreen. */}
      <Animated.View
        style={[
          styles.blobTopLeft,
          {
            opacity: blobsOpacity,
            transform: [
              { rotate: "-14deg" },
              {
                translateX: blob1Drift.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }),
              },
              {
                translateY: blob1Drift.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
              },
              {
                scale: blob1Drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }),
              },
            ],
          },
        ]}
      />

      {/* Bottom-right orange shape, larger, partially offscreen. */}
      <Animated.View
        style={[
          styles.blobBottomRight,
          {
            opacity: blobsOpacity,
            transform: [
              { rotate: "10deg" },
              {
                translateX: blob2Drift.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }),
              },
              {
                translateY: blob2Drift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }),
              },
              {
                scale: blob2Drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
              },
            ],
          },
        ]}
      />

      {/* Centered white leaf + NUTRI wordmark. */}
      <Animated.Image
        source={require("@/assets/splash-icon.png")}
        style={[styles.logo, { transform: [{ scale: logoScale }] }]}
        resizeMode="contain"
      />
      <Animated.View style={{ opacity: textOpacity }}>
        <Text
          style={[
            styles.wordmark,
            brandFontAvailable ? { fontFamily: fontFamily.headline } : null,
          ]}
        >
          NUTRI
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: "#0B0B0B",
    alignItems: "center",
    justifyContent: "center",
  },
  blobTopLeft: {
    position: "absolute",
    top: -130,
    left: -120,
    width: 340,
    height: 310,
    backgroundColor: colors.accent,
    borderTopLeftRadius: 150,
    borderTopRightRadius: 200,
    borderBottomRightRadius: 220,
    borderBottomLeftRadius: 160,
  },
  blobBottomRight: {
    position: "absolute",
    bottom: -190,
    right: -170,
    width: 520,
    height: 470,
    backgroundColor: colors.accent,
    borderTopLeftRadius: 250,
    borderTopRightRadius: 220,
    borderBottomRightRadius: 240,
    borderBottomLeftRadius: 230,
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
  wordmark: {
    marginTop: 22,
    color: "#FFFFFF",
    fontSize: 24,
    letterSpacing: 7,
    // letterSpacing trails the last glyph — offset so the word sits optically
    // centered under the leaf.
    paddingLeft: 7,
    fontWeight: "700",
    textAlign: "center",
  },
});
