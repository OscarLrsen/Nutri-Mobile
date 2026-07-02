import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

import { colors, spacing } from "@/theme";
import { ThemedText } from "@/components/ui/ThemedText";
import { Button } from "@/components/ui/Button";

interface State {
  error: Error | null;
}

/**
 * App-wide crash boundary. React error boundaries must be class components
 * (no hook equivalent exists as of React 19) — this is the one deliberate
 * exception to "functional components everywhere" in this codebase.
 *
 * Nothing on the web app plays an equivalent role today (Next.js has its
 * own error.tsx convention per-route, not reviewed as part of this phase);
 * this is a new-for-mobile safety net, not a port of an existing pattern.
 */
export class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <ThemedText variant="title" style={styles.title}>
            Något gick fel
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={styles.message}>
            Ett oväntat fel inträffade. Försök igen.
          </ThemedText>
          <Button label="Försök igen" onPress={this.reset} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
    padding: spacing[6],
    backgroundColor: colors.bg,
  },
  title: {
    textAlign: "center",
  },
  message: {
    textAlign: "center",
  },
});
