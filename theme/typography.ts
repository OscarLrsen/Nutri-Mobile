/**
 * Font families, ported from Nutri-Frontend.
 *
 * Confirmed by direct source inspection (not guessed):
 * - Headlines: "Sora" (400/500/600/700/800), loaded via next/font/google in src/app/layout.tsx.
 * - Body/UI:   "Inter" (400/500/600/700), loaded via next/font/google in src/app/layout.tsx.
 * - Numeric/price/macro displays: "DM Mono" — verified directly in src/app/meny/page.tsx and
 *   src/app/varukorg/page.tsx (`fontFamily: "'DM Mono', monospace"` inline styles used throughout
 *   for prices, macros, and order numbers so digits align in tabular layouts).
 *
 * OPEN QUESTION (see spec §23): the web app's CSS also declares `--font-ui: 'DM Sans'` as a
 * custom property, but no next/font/google load for "DM Sans" was confirmed anywhere in the
 * codebase — only Sora and Inter were confirmed as actually-loaded web fonts. Rather than guess
 * whether "DM Sans" renders as a real webfont or silently falls back to a system font on web,
 * mobile body text uses the *confirmed* font (Inter) here. Revisit if a designer confirms DM Sans
 * is intentionally the primary UI font on web.
 */
export const fontFamily = {
  headline: "Sora_700Bold",
  headlineSemibold: "Sora_600SemiBold",
  headlineExtrabold: "Sora_800ExtraBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemibold: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  mono: "DMMono_400Regular",
  monoMedium: "DMMono_500Medium",
} as const;

/**
 * Type scale. The web spec did not document an explicit numeric type scale
 * (Tailwind v4 defaults were used unmodified for font-size), so this is a
 * standard, conservative scale rather than a ported value — adjust once
 * real screens are designed against it.
 */
export const fontSize = {
  xs: 11,
  sm: 12.5,
  base: 14,
  md: 15,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
} as const;

export type FontFamilyToken = keyof typeof fontFamily;
export type FontSizeToken = keyof typeof fontSize;
