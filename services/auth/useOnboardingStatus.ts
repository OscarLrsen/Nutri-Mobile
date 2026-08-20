import { useQuery } from "@tanstack/react-query";

import { supabase } from "./supabase";
import { useAuth } from "./AuthProvider";

/**
 * Reads `profiles.is_onboarding_complete` for the signed-in user — the
 * minimal slice of the web UserContext's profile that gating features
 * (Nutri Anpassar) need. The profiles table is a read-only Supabase table
 * from the app's perspective (CLAUDE.md/spec §17); unlike the web
 * UserContext we do NOT upsert a missing row here — a missing row simply
 * means onboarding is not complete (null), which is exactly what the gate
 * needs to know.
 *
 * Web semantics preserved: null = never asked, false = chose "later",
 * true = completed. The gate triggers on anything !== true.
 *
 * `null` IS A REAL ANSWER AND MUST NOT BE FAKED. This hook used to return
 * `query.data ?? null`, which collapsed three different situations into the
 * one value that means "never onboarded":
 *
 *   still loading (data undefined) -> null
 *   the read failed               -> null   (the queryFn swallowed `error`)
 *   the column really is null     -> null
 *
 * Since ProfileScreen showed the "Welcome to Nutri!" modal on exactly that
 * value, every cold start and every transient Supabase failure re-welcomed
 * an existing customer. `isKnown` now separates a settled answer from a
 * missing one, and a failed read throws so React Query reports it as an
 * error instead of quietly answering "new user".
 */
export function useOnboardingStatus() {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["profiles", user?.id, "is_onboarding_complete"],
    enabled: !!user,
    queryFn: async (): Promise<boolean | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_onboarding_complete")
        .eq("id", user!.id)
        .single();
      // Thrown, not swallowed: a failed read is an error, not a verdict.
      if (error) throw error;
      return (data?.is_onboarding_complete as boolean | null) ?? null;
    },
  });

  const settled = !!user && query.isSuccess;

  return {
    /** true until both auth and the profile read have settled. */
    loading: authLoading || (!!user && query.isLoading),
    /** False while loading, and false when the read failed — callers must
     *  not treat "we don't know" as "never onboarded". */
    isKnown: settled,
    isError: query.isError,
    /** Only meaningful when `isKnown`. */
    isOnboardingComplete: settled ? (query.data ?? null) : null,
  };
}
