import { StyleSheet, View, type ViewProps } from "react-native";

import { colors, radius, spacing } from "@/theme";
import { ThemedText } from "./ThemedText";

/** Pill-shaped badge — --radius-pill (20px), accent-soft background +
 * accent text, matching the badge pattern in spec §15.6. */
export function Badge({ label, style, ...rest }: ViewProps & { label: string }) {
  return (
    <View style={[styles.badge, style]} {...rest}>
      <ThemedText variant="caption" color="accent">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
    alignSelf: "flex-start",
  },
});
