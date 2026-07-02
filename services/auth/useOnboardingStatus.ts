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
      if (error) return null;
      return (data?.is_onboarding_complete as boolean | null) ?? null;
    },
  });

  return {
    /** true until both auth and the profile read have settled. */
    loading: authLoading || (!!user && query.isLoading),
    isOnboardingComplete: query.data ?? null,
  };
}
