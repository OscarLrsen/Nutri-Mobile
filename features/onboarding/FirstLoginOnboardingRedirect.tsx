import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";

import { useAuth } from "@/services/auth/AuthProvider";
import { useFirstLoginFlow } from "./useFirstLoginFlow";
import { NUTRITION_ONBOARDING_ROUTE } from "./nutritionOnboardingRoute";

/**
 * Takes a customer to the FILL PROFILE step — step 3 of three — when it is
 * genuinely its turn. Renders nothing.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────
 *
 * "Vill du ange din kostprofil nu?" lives inside the Konto screen, so
 * nothing shows it to a customer sitting on Home. Without this, a new
 * account finished the intro, answered the discount, and then met the
 * profile prompt only if it happened to tap through to Konto itself.
 *
 * ── WHY IT NO LONGER JUMPS THE QUEUE ─────────────────────────────────
 *
 * This used to fire on the raw profile gate — `profile-gap`, straight
 * from the backend — which is the WRONG signal for a navigation, because
 * it is true from the first moment a new account signs in. The redirect
 * therefore ran while the first-run intro was still on screen and before
 * the welcome discount had been offered, and Konto opens the profile
 * prompt on arrival. That is exactly how step 3 became the first thing a
 * new customer saw.
 *
 * The condition is now the shared first-login machine, so a profile gap
 * alone is not enough: the intro must be done AND the discount dealt
 * with. `loading` and `error` are still not verdicts — a slow network
 * must never pull someone into a profile they already filled in.
 *
 * ── ONCE, AND NEVER FIGHTING NAVIGATION ──────────────────────────────
 *
 * At most one redirect per signed-in user per app session. After that the
 * customer is free to go wherever they like, and the profile screen keeps
 * its own resume behaviour — a half-finished profile continues where it
 * stopped rather than restarting.
 *
 * `navigate`, not `replace`: it selects the Konto tab and leaves the
 * customer able to move on. Once the profile is good the flow reports
 * `ready` and this never fires again.
 */
export function FirstLoginOnboardingRedirect() {
  const { user } = useAuth();
  const { step } = useFirstLoginFlow();
  const router = useRouter();

  /** The user id we have already redirected, so it happens once. */
  const redirectedFor = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (!userId) {
      // Signed out: forget, so the next account gets its own one redirect.
      redirectedFor.current = null;
      return;
    }
    // ONLY on our turn. Steps 1 and 2 come first, and "loading" means we
    // do not know yet — neither is a reason to navigate anyone anywhere.
    if (step !== "profile-prompt") return;
    if (redirectedFor.current === userId) return;

    redirectedFor.current = userId;
    router.navigate(NUTRITION_ONBOARDING_ROUTE);
  }, [user?.id, step, router]);

  return null;
}
