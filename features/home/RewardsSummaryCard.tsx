import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Gift } from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { useAuth } from "@/services/auth/AuthProvider";
import { getRewardStatus } from "@/services/api/rewards";
import { homeCopy, pointsCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Nutri-poäng — balance + spin availability from GET /api/rewards/status.
 * Deliberately the SAME query key family as RewardsScreen
 * (["rewards","status", userId]) so Hem, /beloningar and the spin flow share
 * one cache row per user; the user id in the key prevents cross-account
 * cache bleed on shared devices. Auth-gated: never fired signed-out.
 */
export function RewardsSummaryCard() {
  const router = useRouter();
  const { user } = useAuth();

  const statusQuery = useQuery({
    queryKey: ["rewards", "status", user?.id ?? null],
    queryFn: getRewardStatus,
    enabled: !!user,
  });

  const status = statusQuery.data ?? null;
  const canSpin = status?.canSpin === true;

  return (
    <Card style={styles.card} accessibilityLabel={homeCopy.pointsHead}>
      <ThemedText style={styles.sectionLabel}>{homeCopy.pointsHead.toUpperCase()}</ThemedText>

      {statusQuery.isLoading ? (
        <Skeleton height={30} width={120} />
      ) : (
        <View style={styles.balanceRow}>
          <ThemedText variant="monoLarge" style={styles.balanceValue}>
            {status ? status.pointsBalance : "–"}
          </ThemedText>
          <ThemedText variant="caption" style={styles.balanceUnit}>
            {pointsCopy.balanceUnit}
          </ThemedText>
        </View>
      )}

      {canSpin ? (
        <Pressable
          onPress={() => router.push("/beloningar")}
          style={({ pressed }) => [styles.spinPill, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={homeCopy.spinReady}
        >
          <Gift size={14} color={colors.accent} />
          <ThemedText variant="caption" style={styles.spinPillText}>
            {homeCopy.spinReady}
          </ThemedText>
        </Pressable>
      ) : null}

      <View style={styles.linkRow}>
        <NavLink label={homeCopy.toRewards} onPress={() => router.push("/beloningar")} />
        <NavLink label={homeCopy.toPoints} onPress={() => router.push("/poang")} />
      </View>
    </Card>
  );
}

function NavLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navLink, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <ThemedText variant="caption" style={styles.navLinkText}>
        {label}
      </ThemedText>
      <ChevronRight size={13} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[3],
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing[2],
  },
  balanceValue: {
    fontSize: 28,
    color: colors.textPrimary,
  },
  balanceUnit: {
    color: colors.textSecondary,
  },
  spinPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    alignSelf: "flex-start",
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  spinPillText: {
    color: colors.accent,
    fontFamily: fontFamily.bodySemibold,
  },
  linkRow: {
    flexDirection: "row",
    gap: spacing[4],
  },
  navLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: spacing[1],
  },
  navLinkText: {
    color: colors.textSecondary,
  },
});
