import { StyleSheet, View } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { EmptyState } from "@/components/feedback/EmptyState";
import { spacing } from "@/theme";

/**
 * CART PLACEHOLDER — infrastructure phase only. No CartContext port, no
 * checkout, no payment (all explicitly out of scope this phase — spec's
 * "ingen checkout, ingen betalning" instruction). This screen exists purely
 * to prove tab navigation works; the empty-state component is the only
 * "real" UI behavior demonstrated here.
 */
export default function VarukorgScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText variant="headline">Varukorg</ThemedText>
      </View>
      <EmptyState message="Varukorgen byggs i nästa fas." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing[5],
  },
});
