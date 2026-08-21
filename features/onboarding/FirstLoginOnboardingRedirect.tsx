import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";

import { useAuth } from "@/services/auth/AuthProvider";
import { useNutritionProfileGate } from "./useNutritionProfileGate";
import { NUTRITION_ONBOARDING_ROUTE } from "./nutritionOnboardingRoute";

/**
 * Sends a customer who still needs onboarding to it. Renders nothing.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────
 *
 * Nothing took a new customer TO onboarding. Signing in for the first time
 * landed on Home, and the profile onboarding only opened if they happened
 * to tap through to Konto themselves. The one thing that did greet them was
 * the welcome-coupon modal — which is how a 20% discount ended up arriving
 * before the app had asked a single question.
 *
 * Gating that modal fixes the ORDER but would otherwise leave a new
 * customer on Home with nothing at all. This is the other half: the app
 * takes them where they need to go.
 *
 * ── WHAT DECIDES ─────────────────────────────────────────────────────
 *
 * The backend, through the same shared ["nutrition","today"] row Home
 * already mounts, so this costs no request. `profile-gap` is a real 404/422
 * meaning the stored profile cannot carry the app's features; `loading` and
 * `error` are NOT that, and neither redirects — a slow network must never
 * pull someone into onboarding they have already done. That distinction is
 * the whole reason useNutritionProfileGate is four-valued.
 *
 * ── ONCE, AND NEVER FIGHTING NAVIGATION ──────────────────────────────
 *
 * At most one redirect per signed-in user per app session. After that the
 * customer is free to go wherever they like, and the profile screen keeps
 * its own resume behaviour — a half-finished onboarding continues where it
 * stopped rather than restarting.
 *
 * `navigate`, not `replace`: it selects the Konto tab and leaves the
 * customer able to move on. Once the profile is good the gate reports
 * `ready` and this never fires again.
 */
export function FirstLoginOnboardingRedirect() {
  const { user } = useAuth();
  const { status } = useNutritionProfileGate();
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
    // Only a real profile gap. "loading" and "error" mean we do not know.
    if (status !== "profile-gap") return;
    if (redirectedFor.current === userId) return;

    redirectedFor.current = userId;
    router.navigate(NUTRITION_ONBOARDING_ROUTE);
  }, [user?.id, status, router]);

  return null;
}
