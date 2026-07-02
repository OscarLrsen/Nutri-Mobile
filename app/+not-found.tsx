import { Link } from "expo-router";
import { StyleSheet } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { spacing } from "@/theme";

export default function NotFoundScreen() {
  return (
    <Screen>
      <ThemedText variant="title" style={styles.title}>
        Sidan hittades inte
      </ThemedText>
      <Link href="/" style={styles.link}>
        <ThemedText variant="body" color="accent">
          Gå till menyn
        </ThemedText>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    textAlign: "center",
    marginTop: spacing[10],
  },
  link: {
    marginTop: spacing[4],
    alignSelf: "center",
  },
});
