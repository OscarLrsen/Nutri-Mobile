import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/ui/Button";
import { LanguageButton } from "@/components/language/LanguageButton";
import { ThemedText } from "@/components/ui/ThemedText";
import { useTranslation } from "@/i18n";
import { colors, spacing } from "@/theme";

/**
 * Hem for signed-out users — a calm entry point instead of the old sales
 * hero: identity, one-line pitch, login/register CTAs and a secondary path
 * to the menu. Deliberately fetches NOTHING: every nutrition/rewards
 * endpoint is auth-gated, and the store status now lives on Meny.
 */
export function LoggedOutHome() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Discreet language switch — top-right, away from the login/register CTAs. */}
      <LanguageButton style={styles.languageButton} />

      <View accessibilityRole="header" style={styles.headlineBlock}>
        <ThemedText variant="headline" style={styles.headline}>
          {t("hero.headline1")}
        </ThemedText>
        <ThemedText variant="headline" style={[styles.headline, styles.headlineAccent]}>
          {t("hero.headline2")}
        </ThemedText>
      </View>

      <ThemedText style={styles.pitch}>{t("home.pitchBody")}</ThemedText>

      <View style={styles.ctaBlock}>
        <Button
          label={t("auth.navLogin")}
          onPress={() => router.push("/logga-in")}
          accessibilityLabel={t("auth.navLogin")}
        />
        <Button
          label={t("auth.createAccount")}
          variant="secondary"
          onPress={() => router.push("/registrera")}
          accessibilityLabel={t("auth.createAccount")}
        />
        <Pressable
          onPress={() => router.navigate("/(tabs)/meny")}
          style={({ pressed }) => [styles.menuLink, pressed && { opacity: 0.7 }]}
          accessibilityRole="link"
          accessibilityLabel={t("home.seeMenuSecondary")}
        >
          <ThemedText variant="caption" style={styles.menuLinkText}>
            {t("home.seeMenuSecondary")}
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
  languageButton: {
    position: "absolute",
    top: spacing[4],
    right: 0,
  },
});
