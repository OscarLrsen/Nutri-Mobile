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
import { AuthProvider } from "@/services/auth/AuthProvider";
import { CartProvider } from "@/context/CartContext";
import { CouponProvider } from "@/context/CouponContext";
import { WelcomeCouponModal } from "@/features/coupons/WelcomeCouponModal";
import { SpinNudgeSheet } from "@/features/rewards/SpinNudgeSheet";
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
                    <View style={{ flex: 1, backgroundColor: colors.bg }}>
                      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                        <Stack.Screen name="(tabs)" />
                        {/* Title is set inside the screen itself (needs i18n,
                            which isn't available at this layout level). */}
                        <Stack.Screen name="+not-found" options={{ headerShown: true }} />
                      </Stack>
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
                        </>
                      )}
                      {/* Animated startup screen on top of the booting app. */}
                      {!splashDone && (
                        <NutriSplashScreen
                          brandFontAvailable={fontsLoaded}
                          onDone={() => setSplashDone(true)}
                        />
                      )}
                    </View>
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
