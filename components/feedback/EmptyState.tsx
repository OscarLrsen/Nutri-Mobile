import { StyleSheet, View } from "react-native";
import { Inbox } from "lucide-react-native";

import { colors, spacing } from "@/theme";
import { ThemedText } from "@/components/ui/ThemedText";

/** Empty-state pattern (spec §15.5) — muted icon + muted text, no red/error
 * styling since an empty list isn't an error condition. */
export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.container}>
      <Inbox color={colors.textMuted} size={28} />
      <ThemedText variant="body" color="textSecondary" style={styles.message}>
        {message}
      </ThemedText>
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
