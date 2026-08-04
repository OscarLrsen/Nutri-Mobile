import type { User } from "@supabase/supabase-js";

/**
 * Display-name/initials derivation, extracted verbatim from ProfileScreen's
 * proven fallback chain (full_name → email → caller's fallback copy) so Hem
 * and Profil greet the user identically. Pure functions — the caller passes
 * its own fallback string, keeping utils/ free of copy imports.
 */

export function deriveDisplayName(user: User | null | undefined, fallback: string): string {
  return (user?.user_metadata?.full_name as string | undefined) || user?.email || fallback;
}

export function deriveInitials(user: User | null | undefined): string {
  const source = ((user?.user_metadata?.full_name as string | undefined) || user?.email || "NU").trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}
