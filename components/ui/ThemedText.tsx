import { Text, type TextProps } from "react-native";

import { colors, fontFamily, fontSize } from "@/theme";

type Variant = "headline" | "title" | "body" | "bodyMedium" | "caption" | "mono" | "monoLarge";

interface ThemedTextProps extends TextProps {
  variant?: Variant;
  color?: keyof typeof colors;
}

const variantStyles: Record<Variant, { fontFamily: string; fontSize: number }> = {
  headline: { fontFamily: fontFamily.headlineExtrabold, fontSize: fontSize["2xl"] },
  title: { fontFamily: fontFamily.headline, fontSize: fontSize.xl },
  body: { fontFamily: fontFamily.body, fontSize: fontSize.base },
  bodyMedium: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.base },
  caption: { fontFamily: fontFamily.body, fontSize: fontSize.sm },
  mono: { fontFamily: fontFamily.mono, fontSize: fontSize.base },
  monoLarge: { fontFamily: fontFamily.monoMedium, fontSize: fontSize.lg },
};

/**
 * Themed text primitive — every piece of copy in the app should render
 * through this rather than a bare RN <Text>, so font-family/size changes
 * only ever need to happen in one place (theme/typography.ts).
 */
export function ThemedText({ variant = "body", color = "textPrimary", style, ...rest }: ThemedTextProps) {
  return <Text style={[variantStyles[variant], { color: colors[color] }, style]} {...rest} />;
}
