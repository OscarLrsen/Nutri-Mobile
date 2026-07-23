import { useRouter } from "expo-router";

import { useAuth } from "@/services/auth/AuthProvider";
import { useTranslation } from "@/i18n";
import { MenuPlanCard } from "./MenuPlanCard";

/**
 * Heldagsmåltid menu entry — presented via the shared MenuPlanCard so it sits
 * side-by-side with, and equal in weight to, Nutri anpassar. Auth behaviour is
 * unchanged from the original card: logged in → the in-app /heldag flow;
 * logged out → /logga-in with a return path to /heldag, plus a lock hint.
 */
export function FullDayMealCard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const handleCta = () => {
    if (isLoggedIn) {
      router.push("/heldag");
    } else {
      router.push({ pathname: "/logga-in", params: { next: "/heldag" } });
    }
  };

  return (
    <MenuPlanCard
      badge={t("landing.fulldayAdvanced")}
      heading={t("landing.fulldayHeading")}
      subheading={t("landing.fulldaySubheading")}
      ctaLabel={isLoggedIn ? t("landing.fulldayCtaShort") : t("landing.fulldayCtaLoginShort")}
      accessibilityLabel={isLoggedIn ? t("landing.fulldayCtaOrder") : t("landing.fulldayCtaLogin")}
      lockLabel={isLoggedIn ? undefined : t("landing.fulldayLoginRequired")}
      onPress={handleCta}
    />
  );
}
