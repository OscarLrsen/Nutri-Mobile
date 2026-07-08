import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { landingCopy as copy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Om Nutri — port of the web's landing AboutNutri.tsx: uppercase two-part
 * heading ("Hela råvaror." white, "Beräknat för dig." orange) and a short
 * body. Card palette matches the source's inline styles (#1A1A1A / #262626).
 */
export function AboutNutriCard() {
  return (
    <View style={styles.card}>
      <ThemedText style={styles.heading}>
        {copy.aboutHeading1}{" "}
        <ThemedText style={[styles.heading, { color: colors.accent }]}>
          {copy.aboutHeading2}
        </ThemedText>
      </ThemedText>
      <ThemedText style={styles.body}>{copy.aboutBody}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: spacing[5],
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#262626",
  },
  heading: {
    fontSize: 17,
    fontFamily: fontFamily.bodyBold,
    textTransform: "uppercase",
    letterSpacing: -0.2,
    lineHeight: 24,
    color: "#FFFFFF",
    marginBottom: spacing[3],
  },
  body: { fontSize: 13.5, lineHeight: 20, color: "#888888" },
});
