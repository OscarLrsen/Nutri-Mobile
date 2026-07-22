import { ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/services/auth/AuthProvider";
import { colors, spacing } from "@/theme";

import { GreetingHeader } from "./GreetingHeader";
import { RewardsBell } from "./RewardsBell";
import { DailyTargetsCard } from "./DailyTargetsCard";
import { TodayOrderStatusCard } from "./TodayOrderStatusCard";
import { RewardsSummaryCard } from "./RewardsSummaryCard";
import { RegularDropSection } from "./RegularDropSection";
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
        <View style={[styles.hero, !user && styles.heroLoggedOut]}>
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(232,101,10,0.13)", "rgba(28,28,30,0.82)", "rgba(17,17,17,0.2)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.heroGlow} />
          <View style={styles.logoRow}>
            <View style={styles.headerSlot}>
              <RewardsBell />
            </View>
            <Image
              source={require("@/assets/nutri-logo.png")}
              style={styles.logo}
              contentFit="contain"
              accessibilityLabel="Nutri"
            />
            {/* Reserved balance slot. No notification route exists, so this
                intentionally stays non-interactive instead of becoming a
                misleading bell button. */}
            <View style={styles.headerSlot} />
          </View>
          {user ? <GreetingHeader /> : null}
        </View>

        {user ? (
          <View style={styles.sections}>
            <DailyTargetsCard />
            <TodayOrderStatusCard />
            {/* TODO fas 7: onSelectOption opens the vote-confirmation sheet. */}
            <RegularDropSection onSelectOption={() => {}} />
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
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
  },
  contentLoggedOut: {
    flexGrow: 1,
  },
  hero: {
    overflow: "hidden",
    gap: spacing[4],
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: colors.card,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    marginBottom: spacing[4],
  },
  heroLoggedOut: {
    paddingBottom: spacing[3],
  },
  heroGlow: {
    position: "absolute",
    top: -76,
    right: -42,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(232,101,10,0.08)",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSlot: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 46,
    height: 46,
  },
  sections: {
    gap: 14,
  },
});
