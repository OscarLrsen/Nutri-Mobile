import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Gift, Star, type LucideIcon } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { useAuth } from "@/services/auth/AuthProvider";
import { getRewardStatus } from "@/services/api/rewards";
import { RegularDropBanner } from "@/features/rewards/RegularDropBanner";
import { StampCardHomeCard } from "@/features/stampcard/StampCardHomeCard";
import type { ApiRegularDropPoll } from "@/services/api/regularDrops";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { homeAccents } from "./homeAccents";

/**
 * "You're part of the Nutri family" — the Home segment that gathers the
 * three membership features (patch 5): Weekly Reward (spin), Nutri points
 * and the Regular Drop vote. PRESENTATION ONLY:
 * - identical destinations as before (/beloningar, /poang, the existing
 *   RegularDropSheet opened by the parent),
 * - the SAME shared ["rewards","status"] query key as the old summary
 *   card / bell — no new API calls, no new fetch,
 * - the vote row is the existing RegularDropBanner component untouched,
 *   rendered only when a relevant poll exists (same condition as before).
 * Three separate press targets (never one big one); rows follow the
 * Meny/Profil card language — tokens only, no gradients, no glow.
 */
export function NutriFamilySection({
  dropPoll,
  onVotePress,
}: {
  dropPoll: ApiRegularDropPoll | null;
  onVotePress: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();

  const statusQuery = useQuery({
    queryKey: ["rewards", "status", user?.id ?? null],
    queryFn: getRewardStatus,
    enabled: !!user,
  });
  const status = statusQuery.data ?? null;
  const canSpin = status?.canSpin === true;
  const balanceLabel = status
    ? `${status.pointsBalance} ${t("points.balanceUnit")}`
    : null;

  return (
    <View style={styles.section}>
      <ThemedText accessibilityRole="header" style={styles.title}>
        {t("home.familyTitle")}
      </ThemedText>
      <ThemedText style={styles.body}>{t("home.familyBody")}</ThemedText>

      {/* Patch 11 visual pass: each membership row keeps its own icon
          accent (spin = signature orange, points = Home's warm amber) so
          the rows read as distinct features instead of identical list
          lines. Destinations, queries and conditions untouched. */}
      <View style={styles.card}>
        <FamilyRow
          Icon={Gift}
          iconColor={homeAccents.protein.value}
          iconBg={homeAccents.protein.soft}
          title={t("rewards.screenTitle")}
          subtitle={canSpin ? t("home.spinReady") : t("home.familySpinHint")}
          subtitleAccent={canSpin}
          showDot={canSpin}
          onPress={() => router.push("/beloningar")}
          accessibilityLabel={
            canSpin ? t("home.rewardsBellAriaSpinReady") : t("home.rewardsBellAria")
          }
        />
        <View style={styles.divider} />
        <FamilyRow
          Icon={Star}
          iconColor={homeAccents.fat.value}
          iconBg={homeAccents.fat.soft}
          title={t("points.screenTitle")}
          subtitle={t("home.pointsSubtitle")}
          trailing={
            statusQuery.isLoading ? (
              <Skeleton height={14} width={56} />
            ) : balanceLabel ? (
              <ThemedText style={styles.value}>{balanceLabel}</ThemedText>
            ) : null
          }
          onPress={() => router.push("/poang")}
          accessibilityLabel={
            balanceLabel
              ? t("home.pointsCardAriaWithBalance", { balance: balanceLabel })
              : t("home.pointsCardAria")
          }
          accessibilityHint={t("home.pointsCardHint")}
        />
      </View>

      {/* Stamp card (patch 16B) — a full card rather than another list row,
          because it carries visual progress the row language cannot show.
          Renders nothing at all if the API predates patch 16A. */}
      <StampCardHomeCard />

      {/* Vote for Weekly — the existing banner, unchanged, same condition
          (only with a relevant poll) and the same sheet via the parent. */}
      {dropPoll ? <RegularDropBanner poll={dropPoll} onPress={onVotePress} /> : null}
    </View>
  );
}

function FamilyRow({
  Icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  subtitleAccent = false,
  showDot = false,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  Icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  subtitleAccent?: boolean;
  showDot?: boolean;
  trailing?: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.cardAlt }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <View
        style={[styles.iconWrap, { backgroundColor: iconBg }]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Icon size={16} color={iconColor} strokeWidth={2} />
        {showDot ? <View style={styles.dot} /> : null}
      </View>
      <View style={styles.copy}>
        <ThemedText style={styles.rowTitle}>{title}</ThemedText>
        <ThemedText style={[styles.rowSubtitle, subtitleAccent && styles.rowSubtitleAccent]}>
          {subtitle}
        </ThemedText>
      </View>
      {trailing}
      <ChevronRight size={15} color={colors.textTertiary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing[2], marginTop: spacing[2] },
  title: {
    fontSize: 16,
    fontFamily: fontFamily.headlineSemibold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  body: { fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  card: {
    marginTop: spacing[1],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
  },
  divider: { height: 1, backgroundColor: colors.borderSoft },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.btn,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: {
    fontSize: 14,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: -0.1,
    color: colors.textPrimary,
  },
  rowSubtitle: { fontSize: 11.5, color: colors.textTertiary },
  rowSubtitleAccent: { color: colors.accent },
  value: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: colors.textSecondary },
});
