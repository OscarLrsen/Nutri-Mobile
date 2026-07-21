import { useRouter } from "expo-router";

import { useAuth } from "@/services/auth/AuthProvider";
import { landingCopy as copy } from "@/constants/copy";
import { MenuPlanCard } from "./MenuPlanCard";

/**
 * Heldagsmåltid menu entry — presented via the shared MenuPlanCard so it sits
 * side-by-side with, and equal in weight to, Nutri anpassar. Auth behaviour is
 * unchanged from the original card: logged in → the in-app /heldag flow;
 * logged out → /logga-in with a return path to /heldag, plus a lock hint.
 */
export function FullDayMealCard() {
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
      badge={copy.fulldayAdvanced}
      heading={copy.fulldayHeading}
      subheading={copy.fulldaySubheading}
      ctaLabel={isLoggedIn ? copy.fulldayCtaShort : copy.fulldayCtaLoginShort}
      accessibilityLabel={isLoggedIn ? copy.fulldayCtaOrder : copy.fulldayCtaLogin}
      lockLabel={isLoggedIn ? undefined : copy.fulldayLoginRequired}
      onPress={handleCta}
    />
  );
}
