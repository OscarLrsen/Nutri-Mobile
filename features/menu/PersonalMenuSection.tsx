import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/ui/ThemedText";
import { NUTRITION_ONBOARDING_ROUTE } from "@/features/onboarding/nutritionOnboardingRoute";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * The profile-gap CTA at the top of Huvudmåltider.
 *
 * WHAT THIS USED TO BE. "Din personliga meny" — a section carrying two
 * cards: "Anpassa en måltid" (removed in an earlier release) and "Planera
 * din dag", which opened /planera-dagen. The day-plan card is now gone too:
 * those controls render directly on Home, where the day belongs, so keeping
 * an entry point here would be a second door to the same room. The planner
 * route still exists and still works — Home simply is not a door to it, and
 * nothing else links to it either.
 *
 * What remains is the one thing that is genuinely about the MENU: when the
 * backend answers 404/422 (no or incomplete nutrition profile), the cards
 * below cannot carry a personal recommendation, and this says so honestly
 * instead of letting the menu look un-personalised for no stated reason.
 * With a complete profile there is nothing to say, so nothing renders.
 */
export function PersonalMenuSection({ profileGap }: { profileGap: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();

  if (!profileGap) return null;

  return (
    <View style={styles.section}>
      <ThemedText accessibilityRole="header" style={styles.title}>
        {t("menu.personal.title")}
      </ThemedText>
      <ThemedText style={styles.subtitle}>{t("menu.personal.subtitle")}</ThemedText>

      <View style={styles.gapCard}>
        <ThemedText style={styles.gapText}>{t("menu.personal.profileGap")}</ThemedText>
        <Pressable
          onPress={() => router.navigate(NUTRITION_ONBOARDING_ROUTE)}
          style={({ pressed }) => [styles.gapCta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={t("menu.personal.profileGapCta")}
        >
          <ThemedText style={styles.gapCtaText}>{t("menu.personal.profileGapCta")}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing[1],
  },
  title: {
    fontSize: 17,
    fontFamily: fontFamily.headlineSemibold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  gapCard: {
    marginTop: spacing[2],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    padding: spacing[3],
    gap: spacing[2],
  },
  gapText: {
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textPrimary,
  },
  gapCta: {
    alignSelf: "flex-start",
    borderRadius: radius.btn,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  gapCtaText: {
    fontSize: 12.5,
    fontFamily: fontFamily.bodyBold,
    color: colors.textPrimary,
  },
});
