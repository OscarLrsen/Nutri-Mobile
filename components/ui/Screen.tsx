import { StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/theme";

/**
 * Safe-area-aware full-screen background wrapper, matching Nutri-Frontend's
 * dark background (#111111, spec §15.1) and its `body { padding-bottom:
 * env(safe-area-inset-bottom) }` safe-area habit — already notch-aware on
 * web, now natively so here via react-native-safe-area-context.
 */
export function Screen({ style, children, ...rest }: ViewProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
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
