import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { Card } from "@/components/ui/Card";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { ErrorState } from "@/components/feedback/ErrorState";
import { getHealth } from "@/services/api/health";
import { spacing } from "@/theme";

/**
 * MENU PLACEHOLDER — infrastructure phase only.
 *
 * Deliberately does NOT call mealsApi/drinksApi or render any meal/menu
 * data (spec's own explicit "denna fas ska inte innehålla: ingen meny"
 * instruction). What this screen DOES do is prove the full stack works
 * end-to-end using the one genuinely business-logic-free backend call that
 * exists (`GET /health` — spec §7): axios client → auth-aware interceptor
 * (unused here since /health needs no auth) → TanStack Query → themed
 * loading/error states → themed text. Replace this screen's body with real
 * menu UI in the next feature phase; keep the Screen/ThemedText/Card
 * scaffolding.
 */
export default function MenyScreen() {
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });

  return (
    <Screen>
      <View style={styles.content}>
        <ThemedText variant="headline">Meny</ThemedText>
        <ThemedText variant="body" color="textSecondary" style={styles.subtitle}>
          Menyn byggs i nästa fas. Det här är bara navigationsskelettet.
        </ThemedText>

        <Card style={styles.statusCard}>
          <ThemedText variant="caption" color="textTertiary">
            INFRASTRUKTURTEST — BACKEND-ANSLUTNING
          </ThemedText>
          {health.isLoading ? (
            <LoadingIndicator />
          ) : health.isError ? (
            <ErrorState
              message={(health.error as { message?: string })?.message ?? "Kunde inte nå backend."}
              onRetry={() => health.refetch()}
            />
          ) : (
            <ThemedText variant="mono" color="success" style={styles.statusText}>
              GET /health → {JSON.stringify(health.data)}
            </ThemedText>
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
  },
  statusText: {
    marginTop: spacing[1],
  },
});
