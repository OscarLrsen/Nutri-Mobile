import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/ui/Button";
import { ThemedText } from "@/components/ui/ThemedText";
import { authCopy, heroCopy, homeCopy } from "@/constants/copy";
import { colors, spacing } from "@/theme";

/**
 * Hem for signed-out users — a calm entry point instead of the old sales
 * hero: identity, one-line pitch, login/register CTAs and a secondary path
 * to the menu. Deliberately fetches NOTHING: every nutrition/rewards
 * endpoint is auth-gated, and the store status now lives on Meny.
 */
export function LoggedOutHome() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View accessibilityRole="header" style={styles.headlineBlock}>
        <ThemedText variant="headline" style={styles.headline}>
          {heroCopy.headline1}
        </ThemedText>
        <ThemedText variant="headline" style={[styles.headline, styles.headlineAccent]}>
          {heroCopy.headline2}
        </ThemedText>
      </View>

      <ThemedText style={styles.pitch}>{homeCopy.pitchBody}</ThemedText>

      <View style={styles.ctaBlock}>
        <Button
          label={authCopy.navLogin}
          onPress={() => router.push("/logga-in")}
          accessibilityLabel={authCopy.navLogin}
        />
        <Button
          label={authCopy.createAccount}
          variant="secondary"
          onPress={() => router.push("/registrera")}
          accessibilityLabel={authCopy.createAccount}
        />
        <Pressable
          onPress={() => router.navigate("/(tabs)/meny")}
          style={({ pressed }) => [styles.menuLink, pressed && { opacity: 0.7 }]}
          accessibilityRole="link"
          accessibilityLabel={homeCopy.seeMenuSecondary}
        >
          <ThemedText variant="caption" style={styles.menuLinkText}>
            {homeCopy.seeMenuSecondary}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    gap: spacing[4],
    paddingBottom: spacing[10],
  },
  headlineBlock: {
    gap: 2,
  },
  headline: {
    fontSize: 30,
    lineHeight: 36,
  },
  headlineAccent: {
    color: colors.accent,
    fontStyle: "italic",
  },
  pitch: {
    color: colors.textSecondary,
    lineHeight: 22,
  },
  ctaBlock: {
    gap: spacing[3],
    marginTop: spacing[4],
  },
  menuLink: {
    alignSelf: "center",
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  menuLinkText: {
    color: colors.textSecondary,
    textDecorationLine: "underline",
  },
});
