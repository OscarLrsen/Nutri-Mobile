import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/ui/ThemedText";
import { NUTRITION_ONBOARDING_ROUTE } from "@/features/onboarding/nutritionOnboardingRoute";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { MenuPlanCard } from "./MenuPlanCard";

/**
 * "Din personliga meny" (patch 12) — the section at the top of
 * Huvudmåltider that makes the three ways of using Nutri explicit:
 *
 * 1. PLAN YOUR DAY  → /planera-dagen (the mobile port of the existing
 *    server-backed day planner; Heldag's ready-made package is offered
 *    INSIDE it as a quick suggestion — decision Alternativ B, so the menu
 *    top never carries three overlapping plan cards).
 * 2. CUSTOMISE A MEAL → the existing /nutri-anpassar flow (calculation
 *    logic untouched; only the card copy is more action-oriented).
 * 3. Regular meal cards below carry the personal portion recommendation.
 *
 * `profileGap` = the backend answered 404/422 (no/incomplete nutrition
 * profile): the section then shows ONE honest fill-your-profile CTA
 * instead of implying personalisation that doesn't exist yet — and no
 * fake recommendation ever renders on the cards (they get null).
 */
export function PersonalMenuSection({ profileGap }: { profileGap: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.section}>
      <ThemedText accessibilityRole="header" style={styles.title}>
        {t("menu.personal.title")}
      </ThemedText>
      <ThemedText style={styles.subtitle}>{t("menu.personal.subtitle")}</ThemedText>

      {profileGap ? (
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
      ) : null}

      {/* Patch 15: both cards are gated on the SAME signal — the backend's
          profile completeness (404/422). They stay visible so the customer
          can see what unlocks, but carry a written lock reason (never an
          icon alone) and lead to onboarding instead of a screen that would
          only 422. */}
      <View style={styles.cards}>
        <MenuPlanCard
          badge={t("menu.personal.planBadge")}
          heading={t("menu.personal.planHeading")}
          subheading={
            profileGap ? t("menu.personal.lockedSubheading") : t("menu.personal.planSubheading")
          }
          ctaLabel={profileGap ? t("menu.personal.profileGapCta") : t("menu.personal.planCta")}
          lockLabel={profileGap ? t("menu.personal.lockedLabel") : undefined}
          accessibilityLabel={
            profileGap
              ? t("menu.personal.lockedAria", { feature: t("menu.personal.planHeading") })
              : t("menu.personal.planHeading")
          }
          onPress={() =>
            profileGap
              ? router.navigate(NUTRITION_ONBOARDING_ROUTE)
              : router.push("/planera-dagen")
          }
        />
        <MenuPlanCard
          badge={t("menu.personal.customizeBadge")}
          heading={t("menu.personal.customizeHeading")}
          subheading={
            profileGap
              ? t("menu.personal.lockedSubheading")
              : t("menu.personal.customizeSubheading")
          }
          ctaLabel={profileGap ? t("menu.personal.profileGapCta") : t("menu.personal.customizeCta")}
          lockLabel={profileGap ? t("menu.personal.lockedLabel") : undefined}
          accessibilityLabel={
            profileGap
              ? t("menu.personal.lockedAria", { feature: t("menu.personal.customizeHeading") })
              : t("menu.personal.customizeHeading")
          }
          onPress={() =>
            profileGap
              ? router.navigate(NUTRITION_ONBOARDING_ROUTE)
              : router.push("/nutri-anpassar")
          }
        />
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
  cards: {
    marginTop: spacing[2],
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing[3],
    width: "100%",
    minWidth: 0,
  },
});
