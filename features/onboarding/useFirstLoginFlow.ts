import { useAuth } from "@/services/auth/AuthProvider";
import { useWelcomeCouponStatus } from "@/features/coupons/useWelcomeCouponStatus";
import { useIntroSeen } from "./useIntroSeen";
import { useNutritionProfileGate } from "./useNutritionProfileGate";
import { deriveFirstLoginStep, type FirstLoginStep } from "./firstLoginFlow";

/**
 * The single source of truth for the first-login order:
 *
 *   ONBOARDING → WELCOME DISCOUNT → FILL PROFILE → normal flow
 *
 * Three components ask this hook whether it is their turn, and every one
 * of them shows NOTHING unless the answer names them. That is the whole
 * mechanism: priority stated once, in firstLoginFlow.ts, instead of
 * emerging from whichever async signal happened to resolve first.
 *
 * Costs no extra network. All three inputs are already mounted elsewhere
 * in the app and are read here through shared state:
 *
 *   introSeen      introStorage's in-memory mirror (AsyncStorage, local)
 *   welcomeHandled the per-user flag + the shared ["coupons", userId] row
 *   profileGate    the shared ["nutrition","today"] row Home already holds
 */
export function useFirstLoginFlow(): { step: FirstLoginStep } {
  const { user, loading: authLoading } = useAuth();
  const introSeen = useIntroSeen();
  const { handled: welcomeHandled } = useWelcomeCouponStatus();
  const { status: profileGate } = useNutritionProfileGate();

  return deriveFirstLoginStep({
    signedIn: !authLoading && !!user,
    introSeen,
    welcomeHandled,
    profileGate,
  });
}
