import { StyleSheet, View } from "react-native";
import { AlertCircle } from "lucide-react-native";

import { colors, spacing } from "@/theme";
import { ThemedText } from "@/components/ui/ThemedText";
import { Button } from "@/components/ui/Button";

/**
 * Error state — AlertCircle icon + red text + optional retry action,
 * matching the pattern used on /meny for failed loads (spec §15.5). Icon
 * library is lucide-react-native, the RN-native drop-in equivalent of the
 * web app's lucide-react (same icon names, spec §15.4).
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.container}>
      <AlertCircle color={colors.error} size={28} />
      <ThemedText variant="body" color="error" style={styles.message}>
        {message}
      </ThemedText>
      {onRetry ? <Button label="Försök igen" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
    padding: spacing[6],
  },
  message: {
    textAlign: "center",
  },
});
