import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { authCopy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Mina sidor — logged in this tab IS the profile (Feature 10, the web's
 * /profil ported into the tab). Logged out it keeps the Feature 5 auth
 * entry points (login / create account).
 */
export default function KontoScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();

  if (loading) return <Screen />;

  if (user) {
    return (
      <Screen>
        <ProfileScreen />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.content}>
        <ThemedText variant="headline">Mina sidor</ThemedText>
        <ThemedText variant="body" color="textSecondary">
          {authCopy.loginSubtitle}
        </ThemedText>
        <Pressable
          onPress={() => router.push("/logga-in")}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && { backgroundColor: colors.accentHover },
          ]}
          accessibilityRole="button"
        >
          <ThemedText style={styles.primaryButtonText}>{authCopy.navLogin}</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => router.push("/registrera")}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { backgroundColor: "rgba(255,255,255,0.08)" },
          ]}
          accessibilityRole="button"
        >
          <ThemedText style={styles.secondaryButtonText}>{authCopy.createAccount}</ThemedText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing[5],
    gap: spacing[4],
  },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  secondaryButton: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  secondaryButtonText: {
    fontSize: 14.5,
    fontFamily: fontFamily.bodySemibold,
    color: "rgba(255,255,255,0.85)",
  },
});
