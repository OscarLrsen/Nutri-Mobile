/**
 * Spacing scale. The technical spec (§15) did not find an explicit *custom*
 * spacing scale in Nutri-Frontend's Tailwind config — the web app uses
 * Tailwind v4's default linear 4px-based scale unmodified. This mirrors
 * that default scale rather than inventing a bespoke one.
 */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export type SpacingToken = keyof typeof spacing;
