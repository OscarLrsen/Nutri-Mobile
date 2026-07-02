import { colors } from "./colors";
import { radius } from "./radius";
import { spacing } from "./spacing";
import { fontFamily, fontSize } from "./typography";

export const theme = {
  colors,
  radius,
  spacing,
  fontFamily,
  fontSize,
} as const;

export type Theme = typeof theme;

export { colors, radius, spacing, fontFamily, fontSize };
