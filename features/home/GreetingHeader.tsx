import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import { useDisplayName } from "@/services/auth/useDisplayName";
import { getRewardStatus } from "@/services/api/rewards";
import { formatNumber, useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * The slim Home header (release cleanup): one row — the customer's name on
 * the left, their Nutri points on the right. Same name fallback chain as
 * ProfileScreen via the shared util; the points ride the SAME
 * ["rewards","status"] cache the Nutri Family section already fills, so this
 * adds presence without adding a request.
 */
export function GreetingHeader() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  // Never the raw e-mail while the name is still resolving (bug 5) — real
  // name → cached name → neutral fallback; e-mail only once settled no-name.
  const name = useDisplayName(t("profile.fallbackName"));

  const rewardQuery = useQuery({
    queryKey: ["rewards", "status", user?.id ?? null],
    queryFn: getRewardStatus,
    enabled: !!user,
    staleTime: 60_000,
  });

  const points = rewardQuery.data?.pointsBalance ?? null;

  return (
    <View style={styles.row} accessibilityRole="header">
      <ThemedText variant="headline" style={styles.greeting} numberOfLines={1}>
        {t("home.greeting", { name })}
      </ThemedText>
      {points !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("home.pointsPill", { points })}
          onPress={() => router.push("/poang")}
          style={({ pressed }) => [styles.pointsPill, pressed && { opacity: 0.8 }]}
        >
          <Sparkles size={12} color={colors.accent} strokeWidth={2.25} />
          <ThemedText style={styles.pointsText}>
            {formatNumber(points, language)} p
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  greeting: {
    fontSize: 20,
    lineHeight: 26,
    flexShrink: 1,
  },
  pointsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  pointsText: {
    fontSize: 12,
    fontFamily: fontFamily.monoMedium,
    color: colors.accent,
  },
});
