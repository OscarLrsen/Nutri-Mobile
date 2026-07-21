import { useRouter } from "expo-router";

import { heroCopy, landingCopy } from "@/constants/copy";
import { MenuPlanCard } from "./MenuPlanCard";

/**
 * "Nutri anpassar" menu entry — an alternative main-meal flow, presented as a
 * primary plan card equal in weight to Heldagsmåltid via the shared
 * MenuPlanCard. Navigation only: the login guard lives inside
 * NutriAnpassarScreen (web parity), so a plain push is correct here.
 */
export function AnpassarEntryCard() {
  const router = useRouter();

  return (
    <MenuPlanCard
      badge={landingCopy.anpassarBadge}
      heading={heroCopy.nutriCustomize}
      subheading={landingCopy.anpassarSubheading}
      ctaLabel={landingCopy.anpassarCta}
      accessibilityLabel={heroCopy.nutriCustomize}
      onPress={() => router.push("/nutri-anpassar")}
    />
  );
}
