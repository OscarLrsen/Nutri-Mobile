import { StyleSheet, View, type ViewProps } from "react-native";

import { colors, radius, spacing } from "@/theme";

/**
 * Card surface — --radius-card (12px) + --color-card (#1C1C1E) + subtle
 * border, matching the card pattern used throughout /meny and /varukorg
 * (spec §15.6).
 */
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
  },
});
