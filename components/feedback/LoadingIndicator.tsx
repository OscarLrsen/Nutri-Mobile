import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors, spacing } from "@/theme";
import { ThemedText } from "@/components/ui/ThemedText";

/**
 * Inline/section loading state. Not a full-screen overlay — see
 * app/_layout.tsx's splash-screen gate for the app-boot equivalent of the
 * web app's NutriLoadingProvider full-screen overlay (spec §15.5). A
 * screen-level overlay loader (pulsing logo, min-visible-time, 6s safety
 * timeout) is a reasonable future port of that pattern but isn't built here
 * — this phase ships the simpler, standard inline spinner used while
 * TanStack Query queries are in flight.
 */
export function LoadingIndicator({ label }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent} size="large" />
      {label ? (
        <ThemedText variant="caption" color="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  label: {
    marginTop: spacing[2],
  },
});
