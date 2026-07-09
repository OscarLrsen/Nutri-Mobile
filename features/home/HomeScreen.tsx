import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
// WandSparkles = the same glyph the web imports as "Wand2" (renamed upstream
// in newer lucide releases).
import { Gift, ShoppingCart, WandSparkles } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect, useState } from "react";

import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import { getRewardStatus } from "@/services/api/rewards";
import { getLocation, getStoreStatus } from "@/services/api/store";
import { deriveLocationStatusKind, getLocationStatusLabel, type LocationStatusKind } from "@/utils/locationStatus";
import { heroCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { FullDayMealCard } from "./FullDayMealCard";
import { FindUsCard } from "./FindUsCard";
import { AboutNutriCard } from "./AboutNutriCard";
import { HomeFooter } from "./HomeFooter";

/**
 * Landing/Home — mobile port of Nutri-Frontend's HeroMobile.tsx (the web
 * app's actual customer-facing landing on mobile viewports). Structure
 * mirrors the web source top-to-bottom: fixed header (logo + cart), status
 * row "PLATS · IDAG · STATUS", optional publicMessage banner, flex spacer,
 * hero image with gradient fade into #0B0B0B, two-line serif headline
 * (line 2 italic orange), primary "Se menyn" CTA, and two secondary buttons.
 *
 * PRELIMINARY DESIGN DECISIONS (pending the Fable design source, which was
 * not provided — revisit all of these once it exists):
 * - The web's hamburger menu is omitted: bottom tabs replace that navigation
 *   role on mobile.
 * - The web CTA's shimmer sweep + arrow-walk animations are simplified to
 *   the breathing-scale animation only (stable in Expo Go; shimmer needs
 *   masking that isn't worth the complexity before design sign-off).
 * - "Nutri anpassar" and "Min profil" both navigate to the Mina sidor tab
 *   until login (feature 5) and Nutri Anpassar (feature 9) exist.
 * - Hero image contentPosition approximates the web's
 *   `object-position: center 74%`.
 *
 * Below-the-fold sections (port of the web landing's FullDayMeal, FindUs,
 * AboutNutri and NutriFooter): the screen scrolls, with the original hero
 * kept as a full-viewport first section (height measured off the ScrollView
 * so the fold matches the pre-scroll layout exactly).
 */

// Ported 1:1 from HeroMobile.tsx STATUS_COLOR.
const STATUS_COLOR: Record<LocationStatusKind, string> = {
  loading: "#888888",
  noLocation: "#888888",
  closed: "#E8650A",
  paused: "#F4B860",
  tempClosed: "#E8650A",
  notYetOpen: "#F4B860",
  closedForDay: "#E8650A",
  open: "#6FD68A",
};

const BG_DEEP = colors.bgDeep; // #0A0A0A — web hero uses #0B0B0B; token reuse preferred (preliminary)

export function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const statusQuery = useQuery({
    queryKey: ["store", "status"],
    queryFn: getStoreStatus,
    // Web polls store status every 30s (StoreStatusContext) — mirror that.
    refetchInterval: 30_000,
  });
  const locationQuery = useQuery({ queryKey: ["store", "location"], queryFn: getLocation });

  // Weekly reward header entry: green dot = a spin is available. Logged-out
  // users still see the button (the rewards screen owns the login gate).
  const { user } = useAuth();
  const rewardStatusQuery = useQuery({
    queryKey: ["rewards", "status", user?.id ?? null],
    queryFn: getRewardStatus,
    enabled: !!user,
  });
  const canSpin = rewardStatusQuery.data?.canSpin === true;

  const storeStatus = statusQuery.data ?? null;
  const locationData = locationQuery.data ?? null;
  const storeLoading = statusQuery.isLoading || locationQuery.isLoading;
  // Mirrors web StoreStatusContext: unreachable/unknown status counts as closed.
  const isClosed = storeStatus ? storeStatus.status === "Closed" : !storeLoading;
  const isPaused = storeStatus?.status === "Paused";

  const kind = deriveLocationStatusKind({
    isLoading: storeLoading,
    isClosed,
    isPaused,
    location: locationData,
  });

  const locationName =
    (locationData?.isVisible && locationData.locationName) ||
    storeStatus?.location ||
    heroCopy.fallbackLocation;
  const statusLabelText = getLocationStatusLabel(kind, locationData?.openTime).toUpperCase();

  // "Se menyn" breathing-scale — web: scale 1 → 1.015 over 5s, ease-in-out,
  // infinite. Disabled under reduced motion, matching the web's
  // prefers-reduced-motion media query.
  const breathe = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) return;
    breathe.value = withRepeat(
      withSequence(
        withTiming(1.015, { duration: 2500 }),
        withTiming(1, { duration: 2500 })
      ),
      -1
    );
  }, [breathe, reducedMotion]);
  const breatheStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));

  // Gift icon gentle float — alive only while a spin is available; stops
  // (and resets) as soon as the week's reward is claimed. Reduced motion
  // keeps it static (the green dot alone carries the signal).
  const giftFloat = useSharedValue(0);
  useEffect(() => {
    if (!canSpin || reducedMotion) {
      giftFloat.value = withTiming(0, { duration: 200 });
      return;
    }
    giftFloat.value = withRepeat(
      withSequence(
        withTiming(-2.5, { duration: 1100 }),
        withTiming(0, { duration: 1100 })
      ),
      -1
    );
  }, [giftFloat, canSpin, reducedMotion]);
  const giftFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: giftFloat.value }],
  }));

  const heroImageHeight = Math.min(280, windowHeight * 0.34);

  // Viewport height below the fixed header (and above the tab bar) — the
  // hero section is pinned to exactly this so the fold looks identical to
  // the previous non-scrolling layout. Fallback approximates one viewport
  // until the first onLayout lands.
  const [scrollViewportHeight, setScrollViewportHeight] = useState<number | null>(null);
  const heroSectionHeight = scrollViewportHeight ?? windowHeight - insets.top - 58;

  return (
    <View style={styles.root}>
      {/* ── Fixed header: logo centered, cart right (hamburger omitted — tabs) ── */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          style={styles.cartButton}
          onPress={() => router.push("/beloningar")}
          accessibilityRole="button"
          accessibilityLabel={canSpin ? "Veckans belöning — en spin väntar" : "Veckans belöning"}
        >
          <Animated.View style={giftFloatStyle}>
            <Gift size={20} color={canSpin ? colors.accent : colors.textPrimary} />
          </Animated.View>
          {canSpin ? <View style={styles.rewardDot} /> : null}
        </Pressable>
        <Image
          source={require("@/assets/nutri-logo.png")}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="Nutri"
        />
        <Pressable
          style={styles.cartButton}
          onPress={() => router.navigate("/(tabs)/varukorg")}
          accessibilityRole="button"
          accessibilityLabel="Öppna varukorgen"
        >
          <ShoppingCart size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        onLayout={(e) => setScrollViewportHeight(e.nativeEvent.layout.height)}
        showsVerticalScrollIndicator={false}
      >
        {/* ══ Section 1: the original full-viewport hero ══ */}
        <View style={{ height: heroSectionHeight }}>
      {/* ── Status row: PLATS · IDAG · STATUS ── */}
      <View style={styles.statusRow}>
        {!storeLoading && (
          <ThemedText variant="caption" style={styles.statusText}>
            <ThemedText variant="caption" style={styles.statusText}>
              {locationName.toUpperCase()}
            </ThemedText>
            <ThemedText variant="caption" style={styles.statusDot}>
              {"  ·  "}
            </ThemedText>
            <ThemedText variant="caption" style={styles.statusText}>
              {heroCopy.today}
            </ThemedText>
            <ThemedText variant="caption" style={styles.statusDot}>
              {"  ·  "}
            </ThemedText>
            <ThemedText variant="caption" style={[styles.statusText, { color: STATUS_COLOR[kind] }]}>
              {statusLabelText}
            </ThemedText>
          </ThemedText>
        )}
      </View>

      {/* ── Public message banner (admin broadcast) ── */}
      {!storeLoading && storeStatus?.publicMessage ? (
        <View style={styles.publicMessageRow}>
          <ThemedText variant="caption" style={styles.publicMessageText}>
            📢 {storeStatus.publicMessage}
          </ThemedText>
        </View>
      ) : null}

      {/* ── Spacer (web: flex-1 pre-image spacer) ── */}
      <View style={styles.spacer} />

      {/* ── Hero image with gradient fade into the dark background ── */}
      <View style={[styles.heroImageWrap, { height: heroImageHeight }]}>
        <Image
          source={require("@/assets/hero.png")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={{ left: "50%", top: "74%" }}
          accessibilityLabel="Nutri bowl med hela råvaror"
          transition={200}
        />
        <LinearGradient
          // Web stops: transparent 0% → 0.55 @38% → 0.92 @70% → solid 100%
          colors={["rgba(11,11,11,0)", "rgba(11,11,11,0.55)", "rgba(11,11,11,0.92)", BG_DEEP]}
          locations={[0, 0.38, 0.7, 1]}
          style={styles.heroGradient}
          pointerEvents="none"
        />
      </View>

      {/* ── Headline + CTAs ── */}
      <View style={[styles.bottomBlock, { paddingBottom: insets.bottom + spacing[3] }]}>
        <View accessibilityRole="header">
          <ThemedText style={styles.headline}>{heroCopy.headline1}</ThemedText>
          <ThemedText style={[styles.headline, styles.headlineAccent]}>
            {heroCopy.headline2}
          </ThemedText>
        </View>

        <Animated.View style={breatheStyle}>
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={() => router.navigate("/(tabs)/meny")}
            accessibilityRole="button"
            accessibilityLabel={heroCopy.seeMenu}
          >
            <ThemedText variant="bodyMedium" style={styles.ctaText}>
              {heroCopy.seeMenu}  →
            </ThemedText>
          </Pressable>
        </Animated.View>

        <View style={styles.secondaryRow}>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}
            // Web parity: logged-out users are sent to login first;
            // NutriAnpassarScreen enforces that guard itself, so a plain
            // push is enough here.
            onPress={() => router.push("/nutri-anpassar")}
            accessibilityRole="button"
            accessibilityLabel={heroCopy.nutriCustomize}
          >
            <WandSparkles size={16} color={colors.accent} />
            <ThemedText variant="bodyMedium" style={styles.secondaryText}>
              {heroCopy.nutriCustomize}
            </ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}
            onPress={() => router.navigate("/(tabs)/konto")}
            accessibilityRole="button"
            accessibilityLabel={heroCopy.myProfile}
          >
            <ThemedText variant="bodyMedium" style={styles.secondaryText}>
              {heroCopy.myProfile}
            </ThemedText>
          </Pressable>
        </View>
      </View>
        </View>

        {/* ══ Section 2+: web landing sections below the fold ══ */}
        <View style={styles.sections}>
          <FullDayMealCard />
          <FindUsCard location={locationData} storeStatus={storeStatus} isLoading={storeLoading} />
          <AboutNutriCard />
        </View>
        <HomeFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_DEEP,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    backgroundColor: "rgba(11,11,11,0.72)",
  },
  rewardDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ade80",
    borderWidth: 1.5,
    borderColor: "#0B0B0B",
  },
  logo: {
    width: 42,
    height: 42,
  },
  cartButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: {
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
  },
  statusText: {
    fontSize: 10,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 2.2,
    color: "rgba(255,255,255,0.8)",
  },
  statusDot: {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
  },
  publicMessageRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[1],
  },
  publicMessageText: {
    fontSize: 10,
    letterSpacing: 0.6,
    lineHeight: 14,
    textAlign: "center",
    color: "#D4B896",
  },
  spacer: {
    flex: 1,
  },
  heroImageWrap: {
    width: "100%",
  },
  heroGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: "45%",
  },
  bottomBlock: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    gap: spacing[4],
    backgroundColor: BG_DEEP,
  },
  headline: {
    fontFamily: fontFamily.serif,
    fontSize: 42,
    lineHeight: 42,
    textAlign: "center",
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  headlineAccent: {
    fontStyle: "italic",
    color: colors.accent,
  },
  cta: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  ctaPressed: {
    backgroundColor: colors.accentHover,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: fontFamily.bodyBold,
    color: colors.textPrimary,
  },
  secondaryRow: {
    flexDirection: "row",
    gap: spacing[3],
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: "rgba(22,22,22,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  secondaryPressed: {
    backgroundColor: "#1F1F1F",
  },
  secondaryText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  sections: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[3],
    backgroundColor: BG_DEEP,
  },
});
