import { useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from "@expo-google-fonts/sora";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { DMMono_400Regular, DMMono_500Medium } from "@expo-google-fonts/dm-mono";
import { DMSerifDisplay_400Regular } from "@expo-google-fonts/dm-serif-display";

import { queryClient } from "@/lib/queryClient";
import { LanguageProvider } from "@/i18n";
import { AuthProvider, useAuth } from "@/services/auth/AuthProvider";
import { AuthDeepLinkHandler } from "@/services/auth/AuthDeepLinkHandler";
import { CartProvider } from "@/context/CartContext";
import { CouponProvider } from "@/context/CouponContext";
import { CheckoutDiscountProvider } from "@/context/CheckoutDiscountContext";
import { IncludedDrinkProvider } from "@/context/IncludedDrinkContext";
import { WelcomeCouponModal } from "@/features/coupons/WelcomeCouponModal";
import { SpinNudgeSheet } from "@/features/rewards/SpinNudgeSheet";
import { ConsentGateModal } from "@/features/consents/ConsentGateModal";
import { FirstRunOnboardingGate } from "@/features/onboarding/FirstRunOnboardingGate";
import { CartToast } from "@/components/feedback/CartToast";
import { FoodFeedbackPrompt } from "@/features/feedback/FoodFeedbackPrompt";
import { PushNotificationResponder } from "@/features/push/PushNotificationResponder";
import { PushTokenSync } from "@/features/push/PushTokenSync";
import { ErrorBoundary } from "@/components/feedback/ErrorBoundary";
import { NutriSplashScreen } from "@/components/launch/NutriSplashScreen";
import { colors } from "@/theme";

// Keep the native splash screen visible until fonts are loaded — the RN
// equivalent of Nutri-Frontend's NutriLoadingProvider holding a full-screen
// overlay until content is ready (spec §15.5), except here it's gating on
// font readiness specifically, at app-boot, not per-navigation. Once the
// tree renders, NutriSplashScreen takes over: it hides the native splash on
// its first layout and fades itself out when the app is ready.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or unsupported (e.g. web) — safe to ignore.
});
try {
  // Short native cross-fade when the splash is hidden, masking any subpixel
  // difference against the animated startup screen's first frame.
  SplashScreen.setOptions({ fade: true, duration: 150 });
} catch {
  // Unsupported platform/runtime — a hard cut is acceptable.
}

/**
 * Central auth gate (patch 11) — the ONLY place that decides what an
 * unauthenticated user can see. The app is fully account-based:
 *
 * - While the Supabase session restores: render nothing — the native
 *   splash / NutriSplashScreen (mounted above in RootLayout) covers the
 *   screen, so neither Home nor the tab bar can flash before the session
 *   state is known.
 * - Signed OUT: only the auth screens exist. The tab navigator and every
 *   customer screen are inside a guard and are NEVER mounted — nothing
 *   renders "behind" login, and back navigation cannot reach the app.
 *   Any navigation attempt to a guarded route (deep link, stale link)
 *   lands on the first available screen: login.
 * - Signed IN: the full app; the auth screens unmount, and a sign-out
 *   flips the guards so the user lands on login with no back history.
 *
 * getSession() reads local storage (no network), so `loading` always
 * resolves; a corrupt/failed read leaves user null → safe mode = login.
 * Consent gate / first-run intro / survey are overlays mounted ABOVE this
 * navigator in RootLayout; all three are session-gated, so the locked
 * order for a fresh installation is login → (registration/verification)
 * → session → consent → intro → survey → Home.
 */
function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return null;
  const signedIn = !!user;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {/* OUTSIDE both guards on purpose. The confirmation deep link
          (nutri://auth/callback#…) arrives while signed OUT, and the session
          lands a moment later — so this route has to resolve in BOTH states.
          Inside either guard it would be missing on one side of that flip and
          Expo Router would fall through to +not-found, which is the 404 the
          confirmation mail used to end on. */}
      <Stack.Screen name="auth/callback" />
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="beloningar" />
        <Stack.Screen name="feedback" />
        <Stack.Screen name="heldag" />
        <Stack.Screen name="justera-makros" />
        <Stack.Screen name="kupong/[id]" />
        <Stack.Screen name="kuponger" />
        <Stack.Screen name="meal/[id]" />
        <Stack.Screen name="nutri-anpassar" />
        <Stack.Screen name="om-nutri" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="planera-dagen" />
        <Stack.Screen name="poang" />
        <Stack.Screen name="rapportera-problem" />
        <Stack.Screen name="stampkort" />
        {/* Title is set inside the screen itself (needs i18n, which isn't
            available at this layout level). */}
        <Stack.Screen name="+not-found" options={{ headerShown: true }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="logga-in" />
        <Stack.Screen name="registrera" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
    DMSerifDisplay_400Regular,
  });

  // True once the animated startup screen has finished its exit fade. The
  // native splash is hidden by NutriSplashScreen itself (on first layout),
  // so the leaf never leaves the screen between the two layers.
  const [splashDone, setSplashDone] = useState(false);

  if (!fontsLoaded && !fontError) {
    // Native splash screen is still visible at this point — render nothing
    // rather than a flash of unstyled content.
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <LanguageProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <CartProvider>
                  <CouponProvider>
                    <CheckoutDiscountProvider>
                    <IncludedDrinkProvider>
                    <View style={{ flex: 1, backgroundColor: colors.bg }}>
                      {/* Push plumbing (patch 10) — render nothing. Deep
                          links navigate the Stack below the overlays, so
                          the consent gate/intro/survey still cover them. */}
                      <PushNotificationResponder />
                      <PushTokenSync />
                      {/* Email-confirmation return path. Renders nothing;
                          sets the session from an auth deep link so the
                          gate below flips to signed-in on its own. Mounted
                          ABOVE RootNavigator because the gate hides every
                          route while signed out — see the file's header. */}
                      <AuthDeepLinkHandler />
                      {/* Central auth gate (patch 11): the app is fully
                          account-based — see RootNavigator below. */}
                      <RootNavigator />
                      {/* App-wide modal overlays mount once the startup
                          screen is gone — RN Modals would otherwise render
                          above it. Their own show/defer logic is unchanged,
                          just started ~1s later. */}
                      {splashDone && (
                        <>
                          {/* App-wide overlay: welcome-coupon prompt after login. */}
                          <WelcomeCouponModal />
                          {/* App-wide overlay: weekly-spin nudge, once per launch
                              (defers to the welcome prompt on first login). */}
                          <SpinNudgeSheet />
                          {/* App-wide BLOCKING overlay (patch 1.1): mandatory
                              terms/privacy acceptance for accounts the backend
                              flags — mounted last so it stacks above the two
                              nudges whenever both would show. */}
                          <ConsentGateModal />
                          {/* The onboarding survey no longer mounts here —
                              release change: it belongs to the wait after
                              the FIRST ORDER, so OrderStatusScreen mounts
                              it on the active-order views instead. */}
                          {/* Food feedback ("hur smakade maten?") on a later
                              app open after a delivered order. Server-gated;
                              renders nothing while an order is in flight. */}
                          <FoodFeedbackPrompt />
                        </>
                      )}
                      {/* First-run intro (patch 3, session-gated by patch
                          11): renders nothing without a valid session —
                          login is always the first usable screen. For a
                          signed-in user who hasn't completed it, it covers
                          Home until done (consent modal still stacks
                          above; the survey waits for the intro signal). */}
                      <FirstRunOnboardingGate />
                      {/* Cart confirmation ("Tillagd i varukorgen"). Mounted
                          once here so any screen that adds to the cart gets
                          the same feedback, and above RootNavigator so it
                          floats over the tab bar. Non-blocking and
                          pointerEvents="none" — it never eats a tap, which is
                          why it can sit under the gates below rather than
                          fighting them for the top of the stack. */}
                      <CartToast />
                      {/* Animated startup screen on top of the booting app. */}
                      {!splashDone && (
                        <NutriSplashScreen
                          brandFontAvailable={fontsLoaded}
                          onDone={() => setSplashDone(true)}
                        />
                      )}
                    </View>
                    </IncludedDrinkProvider>
                    </CheckoutDiscountProvider>
                  </CouponProvider>
                </CartProvider>
              </AuthProvider>
            </QueryClientProvider>
          </LanguageProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
