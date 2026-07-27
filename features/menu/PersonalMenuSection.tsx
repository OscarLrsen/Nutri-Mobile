import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/ui/ThemedText";
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
            onPress={() => router.navigate("/(tabs)/konto")}
            style={({ pressed }) => [styles.gapCta, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={t("menu.personal.profileGapCta")}
          >
            <ThemedText style={styles.gapCtaText}>{t("menu.personal.profileGapCta")}</ThemedText>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.cards}>
        <MenuPlanCard
          badge={t("menu.personal.planBadge")}
          heading={t("menu.personal.planHeading")}
          subheading={t("menu.personal.planSubheading")}
          ctaLabel={t("menu.personal.planCta")}
          accessibilityLabel={t("menu.personal.planHeading")}
          onPress={() => router.push("/planera-dagen")}
        />
        <MenuPlanCard
          badge={t("menu.personal.customizeBadge")}
          heading={t("menu.personal.customizeHeading")}
          subheading={t("menu.personal.customizeSubheading")}
          ctaLabel={t("menu.personal.customizeCta")}
          accessibilityLabel={t("menu.personal.customizeHeading")}
          onPress={() => router.push("/nutri-anpassar")}
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
