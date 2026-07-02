import { StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { colors } from "@/theme";

interface ScreenProps extends ViewProps {
  /**
   * Defaults to just "top": screens rendered inside the bottom-tab
   * navigator (app/(tabs)/*) must NOT also claim the "bottom" edge here —
   * React Navigation's tab bar already accounts for the bottom safe-area
   * inset itself, so doing both would double the bottom spacing. Pass
   * edges={["top", "bottom"]} explicitly for a screen that has no tab bar
   * or other bottom chrome beneath it (e.g. a future full-screen modal).
   */
  edges?: Edge[];
}

/**
 * Safe-area-aware full-screen background wrapper, matching Nutri-Frontend's
 * dark background (#111111, spec §15.1) and its `body { padding-bottom:
 * env(safe-area-inset-bottom) }` safe-area habit — already notch-aware on
 * web, now natively so here via react-native-safe-area-context.
 */
export function Screen({ style, children, edges = ["top"], ...rest }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      <View style={[styles.container, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
