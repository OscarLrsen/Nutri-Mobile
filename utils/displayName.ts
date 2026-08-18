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

/**
 * The FIRST name out of a stored display name, for greetings ("Hi Pontus",
 * never "Hi Pontus Vångö"). Null when the first token doesn't look like a
 * human name (digits, @, empty) — the caller falls back to its neutral copy,
 * NEVER to the e-mail. Same validation idea as personalizeMealName.
 */
export function firstNameFrom(displayName: string): string | null {
  const first = displayName.trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}][\p{L}'-]*$/u.test(first) ? first : null;
}

export function deriveInitials(user: User | null | undefined): string {
  const source = ((user?.user_metadata?.full_name as string | undefined) || user?.email || "NU").trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}
