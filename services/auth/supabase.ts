import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { secureStorageAdapter } from "@/services/storage/secureStorage";

/**
 * Supabase client for React Native. Mirrors Nutri-Frontend's usage of
 * @supabase/supabase-js (spec §16/§17) but swaps the web-only @supabase/ssr
 * cookie adapter for a SecureStore-backed adapter, and — per Supabase's own
 * React Native guidance — wires AppState so the SDK's auto token-refresh
 * timer stops while the app is backgrounded and resumes on foreground
 * (without this, RN apps can end up with a silently expired session because
 * there is no browser tab to keep the refresh timer alive).
 *
 * Same Supabase project as Nutri-Frontend (spec §0/§17) — there is only one
 * project (nutri-production), no separate staging Supabase instance.
 */
export const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
