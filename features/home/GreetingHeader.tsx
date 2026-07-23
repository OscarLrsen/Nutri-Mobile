import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import { deriveDisplayName } from "@/utils/displayName";
import { useTranslation } from "@/i18n";
import { colors, spacing } from "@/theme";

/** Personal greeting — same name fallback chain as ProfileScreen
 * (full_name → email → profile fallback copy) via the shared util. */
export function GreetingHeader() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const name = deriveDisplayName(user, t("profile.fallbackName"));

  return (
    <View style={styles.container} accessibilityRole="header">
      <ThemedText variant="headline" style={styles.greeting} numberOfLines={1}>
        {t("home.greeting", { name })}
      </ThemedText>
      <ThemedText variant="caption" style={styles.sub}>
        {t("home.greetingSub")}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
    paddingBottom: spacing[2],
  },
  greeting: {
    fontSize: 24,
    lineHeight: 30,
  },
  sub: {
    color: colors.textSecondary,
  },
});
