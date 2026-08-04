import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/services/auth/AuthProvider";
import { useActiveRegularDropQuery } from "@/services/api/regularDrops";
import { RegularDropSheet } from "@/features/rewards/RegularDropSheet";
import { ActiveOrderBanner } from "@/features/order/ActiveOrderBanner";
import { colors, radius, spacing } from "@/theme";

import { GreetingHeader } from "./GreetingHeader";
import { HomeLocationStatusCard } from "./HomeLocationStatusCard";
import { TodayCard } from "./TodayCard";
import { NutriFamilySection } from "./NutriFamilySection";
import { LoggedOutHome } from "./LoggedOutHome";
import { heroGradient } from "./homeAccents";

/**
 * Hem — personal nutrition dashboard (Patch 1 IA, patch 5 visual cleanup).
 *
 * Signed in: greeting → today's targets → today's order status → the Nutri
 * Family segment (Weekly Reward spin + Nutri points + Regular Drop vote —
 * the three membership features gathered under one heading; identical
 * destinations, conditions and query caches as before, see
 * NutriFamilySection).
 * Each section is its own component owning its own query via the shared
 * auth-gated hooks — no store status here: the 30s ["store","status"] poll
 * lives on Meny together with all ordering-related content.
 *
 * Patch 5: the header card is now a flat token card (colors.card +
 * colors.border + radius.card) like every card on Meny — the gradient and
 * glow that made Home feel like a different product are gone, and the old
 * gradient points hero + header gift button are replaced by the segment's
 * rows.
 *
 * Signed out: a static entry point that fetches nothing (every dashboard
 * endpoint requires auth).
 */
export function HomeScreen() {
  const { user, loading } = useAuth();
  // Regular Drop banner — same user-scoped query the sheet uses, so
  // nothing fetches twice. No banner without a relevant poll.
  const dropQuery = useActiveRegularDropQuery();
  const dropPoll = dropQuery.data?.poll ?? null;
  const [dropSheetOpen, setDropSheetOpen] = useState(false);

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
        {/* Header — release slimming: one row (name + Nutri points), no
            logo badge, tighter padding. The soft accent wash stays so Home
            keeps its colour presence without the height. */}
        <LinearGradient
          colors={[...heroGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={[styles.hero, !user && styles.heroLoggedOut]}
        >
          {user ? (
            <GreetingHeader />
          ) : (
            <View style={styles.logoRow}>
              <View style={styles.logoBadge}>
                <Image
                  source={require("@/assets/nutri-logo.png")}
                  style={styles.logo}
                  contentFit="contain"
                  accessibilityLabel="Nutri"
                />
              </View>
            </View>
          )}
        </LinearGradient>

        {user ? (
          <View style={styles.sections}>
            {/* The live order, wherever the customer is — see
                ActiveOrderBanner. Renders nothing without one. */}
            <ActiveOrderBanner />
            {/* Patch 15: where the truck is today, directly under the name
                and above the plan. Shares Meny's store queries. */}
            <HomeLocationStatusCard />
            {/* Release merge: the old "Dagens plan" + "Dagens status" cards
                are ONE section now, with water logging and the day's next
                action — see TodayCard. */}
            <TodayCard />
            {/* The membership features — spin, points and this week's
                vote — gathered under one heading. */}
            <NutriFamilySection
              dropPoll={dropPoll}
              onVotePress={() => setDropSheetOpen(true)}
            />
          </View>
        ) : (
          <LoggedOutHome />
        )}
      </ScrollView>

      {/* Shared Regular Drop sheet — same component and cache as before. */}
      {dropSheetOpen && <RegularDropSheet onClose={() => setDropSheetOpen(false)} />}
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
    paddingBottom: spacing[5],
  },
  contentLoggedOut: {
    flexGrow: 1,
  },
  hero: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    overflow: "hidden",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginBottom: spacing[3],
  },
  heroLoggedOut: {
    paddingBottom: spacing[3],
  },
  logoRow: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoBadge: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.14)",
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  logo: {
    width: 42,
    height: 42,
  },
  sections: {
    gap: spacing[2],
  },
});
