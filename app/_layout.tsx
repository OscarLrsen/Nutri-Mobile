import { useEffect } from "react";
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
import { AuthProvider } from "@/services/auth/AuthProvider";
import { ErrorBoundary } from "@/components/feedback/ErrorBoundary";
import { colors } from "@/theme";

// Keep the native splash screen visible until fonts are loaded — the RN
// equivalent of Nutri-Frontend's NutriLoadingProvider holding a full-screen
// overlay until content is ready (spec §15.5), except here it's gating on
// font readiness specifically, at app-boot, not per-navigation.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or unsupported (e.g. web) — safe to ignore.
});

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

  // Runs after React commits the real tree below (effects fire post-paint),
  // so the native splash screen only comes down once real content is
  // already rendered underneath it — no flash of blank/unstyled UI.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {
        // Already hidden — safe to ignore.
      });
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    // Native splash screen is still visible at this point — render nothing
    // rather than a flash of unstyled content.
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <View style={{ flex: 1, backgroundColor: colors.bg }}>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="+not-found" options={{ headerShown: true, title: "Hittades inte" }} />
                </Stack>
              </View>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
