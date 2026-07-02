import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { LogOut, UserRound } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/services/auth/AuthProvider";
import { authCopy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Mina sidor — Feature 5 scope: auth entry/exit points only. Logged out:
 * login + create-account CTAs (the same auth flow the checkout gate uses).
 * Logged in: identity + "Logga ut" (supabase.auth.signOut, same call the
 * web's menus make). The actual profile experience (goals, onboarding,
 * settings) is a later feature — deliberately not built here.
 */
export default function KontoScreen() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <ThemedText variant="headline">Mina sidor</ThemedText>

        {loading ? null : user ? (
          <>
            <Card style={styles.card}>
              <View style={styles.identityRow}>
                <View style={styles.avatar}>
                  <UserRound size={20} color={colors.accent} strokeWidth={1.75} />
                </View>
                <View style={{ flex: 1 }}>
                  {typeof user.user_metadata?.full_name === "string" && (
                    <ThemedText variant="bodyMedium">{user.user_metadata.full_name}</ThemedText>
                  )}
                  <ThemedText variant="caption" color="textSecondary">
                    {user.email ?? user.id}
                  </ThemedText>
                </View>
              </View>
            </Card>
            <Pressable
              onPress={handleSignOut}
              disabled={signingOut}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && { backgroundColor: "rgba(255,255,255,0.08)" },
                signingOut && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
            >
              <LogOut size={15} color="rgba(255,255,255,0.7)" strokeWidth={1.75} />
              <ThemedText style={styles.secondaryButtonText}>{authCopy.navLogout}</ThemedText>
            </Pressable>
          </>
        ) : (
          <>
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
          </>
        )}
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
  card: { gap: spacing[2] },
  identityRow: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(232,101,10,0.12)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.25)",
    alignItems: "center",
    justifyContent: "center",
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
