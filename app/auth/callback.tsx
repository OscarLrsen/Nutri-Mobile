import { View, StyleSheet } from "react-native";

import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { ThemedText } from "@/components/ui/ThemedText";
import { useTranslation } from "@/i18n";
import { colors, spacing } from "@/theme";

/**
 * The landing route for `nutri://auth/callback` — deliberately almost empty.
 *
 * WHY IT HAS TO EXIST. AuthDeepLinkHandler already consumes the tokens from
 * the incoming URL, and it does so ABOVE the navigator, so no route is
 * needed to make the session work. But Expo Router does not know that: it
 * still resolves the link's PATH, finds nothing at `auth/callback`, and
 * renders `+not-found`. That is the "404 Not Found" the confirmation mail
 * ends on — the session was being set correctly behind a 404 screen.
 *
 * So this route exists purely to be somewhere legitimate to land while the
 * handler works. It performs no auth of its own — one place owns that, and
 * it is the handler — and it navigates nowhere: setting the session flips
 * AuthProvider's state, RootNavigator's guard re-evaluates, and the app
 * moves to the signed-in stack by itself. Adding a redirect here would race
 * that guard.
 *
 * It is registered OUTSIDE both Stack.Protected groups in _layout, because
 * this URL arrives while signed OUT and must still resolve a frame after the
 * session lands.
 */
export default function AuthCallbackScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <LoadingIndicator />
      <ThemedText style={styles.text}>{t("auth.completingSignIn")}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[4],
    backgroundColor: colors.bg,
    paddingHorizontal: spacing[6],
  },
  text: {
    fontSize: 14,
    textAlign: "center",
    color: colors.textSecondary,
  },
});
