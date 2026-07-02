/**
 * Ported 1:1 from Nutri-Frontend's dark-mode design tokens
 * (src/app/globals.css `@theme` block — see NUTRI_MOBILE_TECHNICAL_SPECIFICATION_V1.md §15.1).
 *
 * The web app also has a light "admin" theme (`[data-theme="admin"]`), but that is
 * legacy/admin-only and out of scope for the customer-facing mobile app — Nutri
 * mobile is dark-only, matching the web app's actual customer-facing surface.
 */
export const colors = {
  bg: "#111111",
  bgDeep: "#0A0A0A",

  card: "#1C1C1E",
  cardAlt: "#252525",

  accent: "#E8650A",
  accentHover: "#F07020",
  accentSoft: "rgba(232,101,10,0.12)",
  accentBorder: "rgba(232,101,10,0.25)",

  border: "rgba(255,255,255,0.07)",
  borderSoft: "rgba(255,255,255,0.05)",

  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.45)",
  textTertiary: "rgba(255,255,255,0.35)",
  textMuted: "rgba(255,255,255,0.22)",

  headerBg: "rgba(17,17,17,0.92)",

  // Not a web design token — standard semantic red for error states,
  // matching the web app's ad-hoc error color (#ef4444 / "--color-error").
  error: "#ef4444",
  errorSoft: "rgba(239,68,68,0.12)",
  success: "#22c55e",
} as const;

export type ColorToken = keyof typeof colors;
