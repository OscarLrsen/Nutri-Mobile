import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, WandSparkles } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { heroCopy, homeCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Compact "Nutri anpassar" entry in the menu — the ordering/personalization
 * path that used to live on Hem's hero. Navigation only: the login guard
 * stays in NutriAnpassarScreen itself (web parity), so a plain push is
 * correct here.
 */
export function AnpassarEntryCard() {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push("/nutri-anpassar")}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={heroCopy.nutriCustomize}
    >
      <View style={styles.icon}>
        <WandSparkles size={16} color={colors.accent} />
      </View>
      <View style={styles.text}>
        <ThemedText variant="bodyMedium" style={styles.title}>
          {heroCopy.nutriCustomize}
        </ThemedText>
        <ThemedText variant="caption" style={styles.sub}>
          {homeCopy.actionAnpassarSub}
        </ThemedText>
      </View>
      <ChevronRight size={15} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.btn,
    backgroundColor: "rgba(232,101,10,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    gap: 1,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fontFamily.bodySemibold,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 11,
  },
});
