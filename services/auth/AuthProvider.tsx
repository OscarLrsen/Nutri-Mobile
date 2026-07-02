import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "./supabase";

/**
 * Session/user auth state only — mirrors the *auth* half of Nutri-Frontend's
 * UserContext (spec §11.2), not the onboarding-flow-specific `UserProfile`
 * fields (goal, activity_level, meal_kcal_distribution, etc.), which belong
 * to a future onboarding/profile feature, not this infrastructure phase.
 *
 * Subscribes to supabase.auth.onAuthStateChange exactly as the web app does
 * (SIGNED_IN / TOKEN_REFRESHED / INITIAL_SESSION / SIGNED_OUT — spec §11.2).
 */
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** true until the initial session check has resolved. */
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
