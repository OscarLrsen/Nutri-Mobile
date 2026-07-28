import { isProfileGapError, useTodayNutritionQuery } from "@/services/api/nutritionQueries";

/**
 * The ONE gate for every personal-nutrition feature (patch 15).
 *
 * BACKEND IS THE SOURCE OF TRUTH. `/nutrition-profile/today` answering 200
 * means the profile holds enough fields; 404/422 with MissingFields means
 * it does not. The mobile app never keeps its own list of required fields,
 * and it no longer treats Supabase's `is_onboarding_complete` as the
 * authority — that flag still drives the onboarding modal, the progress UI
 * and the resume flow, but it can be out of sync with the real profile in
 * both directions:
 *
 * - flag false + complete profile → the feature MUST work (200 wins)
 * - flag true + incomplete profile → the feature MUST stay locked (422 wins)
 *
 * The status is deliberately four-valued so a network failure can never be
 * mistaken for an unfinished profile: only `profile-gap` shows the
 * "complete your profile" CTA, while `error` belongs to the screen's normal
 * retry state.
 *
 * Because it is built on the shared ["nutrition","today"] query row, the
 * gate opens by itself as soon as onboarding completes — ProfileScreen
 * invalidates ["nutrition"] on save, so Meny, Planera din dag, Anpassa en
 * måltid and Heldag all unlock without an app restart.
 */
export type NutritionProfileGateStatus = "loading" | "ready" | "profile-gap" | "error";

export function useNutritionProfileGate() {
  const query = useTodayNutritionQuery();

  const status: NutritionProfileGateStatus = query.isError
    ? isProfileGapError(query.error)
      ? "profile-gap"
      : "error"
    : query.data
      ? "ready"
      : "loading";

  return {
    status,
    /** True ONLY for a real 404/422 — never for a network failure. */
    isProfileGap: status === "profile-gap",
    isLoading: status === "loading",
    /** A non-profile failure: the screen's own retry state applies. */
    isError: status === "error",
    refetch: query.refetch,
  };
}
