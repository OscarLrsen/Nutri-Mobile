import { useRouter } from "expo-router";

import { useTranslation } from "@/i18n";
import { MenuPlanCard } from "./MenuPlanCard";

/**
 * "Nutri anpassar" menu entry — an alternative main-meal flow, presented as a
 * primary plan card equal in weight to Heldagsmåltid via the shared
 * MenuPlanCard. Navigation only: the login guard lives inside
 * NutriAnpassarScreen (web parity), so a plain push is correct here.
 */
export function AnpassarEntryCard() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <MenuPlanCard
      badge={t("landing.anpassarBadge")}
      heading={t("hero.nutriCustomize")}
      subheading={t("landing.anpassarSubheading")}
      ctaLabel={t("landing.anpassarCta")}
      accessibilityLabel={t("hero.nutriCustomize")}
      onPress={() => router.push("/nutri-anpassar")}
    />
  );
}
