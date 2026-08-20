import type { ApiNutritionProfile } from "@/services/api/nutrition";
import { formFromProfile, missingRequiredSteps, type RequiredStepId } from "./profileRequirements";

/**
 * THE ONE ANSWER to "what should this customer be shown about their profile".
 *
 * WHAT WENT WRONG. Three booleans decided this independently and could
 * disagree:
 *   1. `profiles.is_onboarding_complete` (Supabase) — null showed the
 *      "Welcome to Nutri!" modal, false showed the "Your profile isn't
 *      complete" banner.
 *   2. the backend's own `isComplete` on /nutrition-profile.
 *   3. the client's required-field list in profileRequirements.
 *
 * Two of those made a long-standing customer look brand new:
 *
 * - `useOnboardingStatus` collapsed BOTH "still loading" and "the read
 *   failed" into `null`, and null is the value that means "never asked".
 *   So a cold start, a slow network or one RLS hiccup re-welcomed a
 *   customer who had onboarded months ago. That is the "ibland" in the
 *   report: it is a race, not a state.
 * - the newer algorithm fields (steps, training, plan focus, cycle) made
 *   older profiles read as incomplete, and the incomplete path was wired
 *   to the same new-user copy.
 *
 * THE FIX IS THE ORDER OF EVIDENCE. A NutritionProfile existing at all is
 * proof that this customer has been through onboarding — it cannot exist
 * otherwise. That is a fact about stored data, not a flag that fails open.
 * So the flag is consulted ONLY when there is no profile to look at.
 *
 * Nobody who has a profile is ever offered onboarding again.
 */

export type ProfileCompletion =
  /** Nothing is known yet. Render no banner and no modal — silence is the
   *  only honest state while the answer is still arriving. */
  | { state: "loading" }
  /** No profile, no evidence of a past one: real first-time onboarding. */
  | { state: "new-user" }
  /** A returning customer whose stored profile predates fields the engine
   *  now reads. Discreet "complete your profile", never a welcome. */
  | { state: "needs-completion"; missing: RequiredStepId[] }
  /** Everything the engine needs is stored. Show nothing at all. */
  | { state: "complete" };

export interface ProfileCompletionInput {
  /** `profiles.is_onboarding_complete`. Only consulted when there is no
   *  nutrition profile — see the note above. */
  onboardingFlag: boolean | null;
  /** False while the flag is still loading OR when the read failed. A
   *  failed read must never be read as "never onboarded". */
  onboardingKnown: boolean;
  /** True while the nutrition profile is still being fetched. */
  profileLoading: boolean;
  /** The stored profile, or null when the customer has none. */
  profile: ApiNutritionProfile | null;
}

export function deriveProfileCompletion({
  onboardingFlag,
  onboardingKnown,
  profileLoading,
  profile,
}: ProfileCompletionInput): ProfileCompletion {
  // Say nothing until both answers are in. The old code showed the welcome
  // modal during this window on every single mount.
  if (profileLoading || !onboardingKnown) return { state: "loading" };

  if (profile !== null) {
    // A profile exists → this customer has onboarded. The Supabase flag is
    // not consulted at all here; it is allowed to be wrong.
    const missing = missingRequiredSteps(formFromProfile(profile));
    return missing.length > 0 ? { state: "needs-completion", missing } : { state: "complete" };
  }

  // No profile at all. The flag is the only remaining evidence.
  // `true` means they finished onboarding once and the profile is gone —
  // rare, but re-welcoming them would be exactly the insult this fixes, so
  // they get the quiet completion path instead.
  if (onboardingFlag === true) return { state: "needs-completion", missing: [] };

  return { state: "new-user" };
}

/** True when the customer should be left completely alone. */
export const isProfileSettled = (c: ProfileCompletion) =>
  c.state === "complete" || c.state === "loading";
