/**
 * Ported 1:1 from Nutri-Frontend's CSS custom properties
 * (--radius-card / --radius-btn / --radius-pill / --radius-chip).
 * See NUTRI_MOBILE_TECHNICAL_SPECIFICATION_V1.md §15.2.
 */
export const radius = {
  card: 12,
  btn: 10,
  pill: 20,
  chip: 5,
} as const;

export type RadiusToken = keyof typeof radius;
