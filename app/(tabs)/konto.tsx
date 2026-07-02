import { StyleSheet, View } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/services/auth/AuthProvider";
import { spacing } from "@/theme";

/**
 * ACCOUNT PLACEHOLDER — infrastructure phase only. No login/register form,
 * no profile fields, no onboarding flow (spec's "ingen profil" exclusion —
 * building an actual login screen is feature UI work, not infrastructure).
 *
 * What this screen DOES do, same pattern as the Meny tab's health-check:
 * prove the auth *infrastructure* (services/auth/AuthProvider.tsx,
 * supabase.ts, secure-store-backed session persistence) actually resolves
 * a real session state, read-only. A real sign-in screen is next-phase work.
 */
export default function KontoScreen() {
  const { user, loading } = useAuth();

  return (
    <Screen>
      <View style={styles.content}>
        <ThemedText variant="headline">Mina sidor</ThemedText>
        <ThemedText variant="body" color="textSecondary" style={styles.subtitle}>
          Inloggning och profil byggs i nästa fas. Det här är bara
          navigationsskelettet.
        </ThemedText>

        <Card style={styles.statusCard}>
          <ThemedText variant="caption" color="textTertiary">
            INFRASTRUKTURTEST — AUTH-STATUS
          </ThemedText>
          {loading ? (
            <Badge label="Kontrollerar session…" />
          ) : user ? (
            <>
              <Badge label="Inloggad" />
              <ThemedText variant="mono" color="textSecondary">
                {user.email ?? user.id}
              </ThemedText>
            </>
          ) : (
            <Badge label="Utloggad (ingen aktiv session)" />
          )}
        </Card>
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
  subtitle: {
    marginTop: -spacing[2],
  },
  statusCard: {
    gap: spacing[2],
    alignItems: "flex-start",
  },
});
