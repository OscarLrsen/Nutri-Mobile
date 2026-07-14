import { ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";

import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/services/auth/AuthProvider";
import { spacing } from "@/theme";

import { GreetingHeader } from "./GreetingHeader";
import { DailyTargetsCard } from "./DailyTargetsCard";
import { TodayOrderStatusCard } from "./TodayOrderStatusCard";
import { RewardsSummaryCard } from "./RewardsSummaryCard";
import { QuickActions } from "./QuickActions";
import { LoggedOutHome } from "./LoggedOutHome";

/**
 * Hem — personal nutrition dashboard (Patch 1 IA).
 *
 * Signed in: greeting → today's targets → today's order status → points →
 * quick actions. Each section is its own component owning its own query via
 * the shared auth-gated hooks (services/api/nutritionQueries, rewards
 * status) — no store status here anymore: the 30s ["store","status"] poll
 * moved to Meny together with all ordering-related content (the old sales
 * hero, "Se menyn" main CTA, FullDayMealCard, FindUs/About/Footer).
 *
 * Signed out: a static entry point that fetches nothing (every dashboard
 * endpoint requires auth).
 */
export function HomeScreen() {
  const { user, loading } = useAuth();

  // Same gate pattern as app/(tabs)/konto.tsx — blank Screen while the
  // Supabase session restores, so the wrong view never flashes.
  if (loading) return <Screen />;

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, !user && styles.contentLoggedOut]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoRow}>
          <Image
            source={require("@/assets/nutri-logo.png")}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel="Nutri"
          />
        </View>

        {user ? (
          <View style={styles.sections}>
            <GreetingHeader />
            <DailyTargetsCard />
            <TodayOrderStatusCard />
            <RewardsSummaryCard />
            <QuickActions />
          </View>
        ) : (
          <LoggedOutHome />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[8],
  },
  contentLoggedOut: {
    flexGrow: 1,
  },
  logoRow: {
    alignItems: "center",
    paddingBottom: spacing[3],
  },
  logo: {
    width: 42,
    height: 42,
  },
  sections: {
    gap: spacing[4],
  },
});
