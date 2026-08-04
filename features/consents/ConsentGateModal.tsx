import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import { acceptMandatoryConsents, getMyConsents } from "@/services/api/consents";
import { openPolicy } from "@/utils/webUrls";
import { useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Consent gate (patch 1.1) — the blocking screen for accounts the BACKEND
 * says must accept the current terms + privacy policy (post-cutoff accounts
 * whose registration consent call never landed: manipulated/old clients,
 * or a network failure right after signup). Mounted app-wide in _layout,
 * driven entirely by GET /api/consents/me (requiresAcceptance) — the client
 * never decides who is covered. The backend also 403s every customer
 * endpoint until acceptance, so this screen is UX, not the enforcement.
 *
 * No-loop guarantee: the accept POST's response carries the updated
 * requiresAcceptance=false, which is written straight into the shared
 * ["consents","me"] cache — the modal closes from server truth, never from
 * an optimistic local flag. Failures keep the modal open with a retryable
 * error. Logout is always available.
 */
export function ConsentGateModal() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);

  const consentsQuery = useQuery({
    queryKey: ["consents", "me"],
    queryFn: getMyConsents,
    enabled: !!user,
    staleTime: 60_000,
  });

  const acceptMutation = useMutation({
    mutationFn: acceptMandatoryConsents,
    onSuccess: (data) => queryClient.setQueryData(["consents", "me"], data),
  });

  const visible = !!user && consentsQuery.data?.requiresAcceptance === true;
  if (!visible) return null;

  const busy = acceptMutation.isPending;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ThemedText style={styles.title}>{t("consents.gateTitle")}</ThemedText>
          <ThemedText style={styles.body}>{t("consents.gateBody")}</ThemedText>

          <Pressable
            onPress={() => setChecked((v) => !v)}
            style={styles.consentRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            disabled={busy}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked ? <Check size={12} color={colors.textPrimary} strokeWidth={2.5} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.consentLabel}>
                {t("auth.termsAcceptPrefix")}
                <ThemedText
                  style={[styles.consentLabel, styles.consentLink]}
                  onPress={() => void openPolicy("kopvillkor", language)}
                  accessibilityRole="link"
                >
                  {t("auth.termsLinkText")}
                </ThemedText>
                {t("auth.termsAnd")}
                <ThemedText
                  style={[styles.consentLabel, styles.consentLink]}
                  onPress={() => void openPolicy("integritet", language)}
                  accessibilityRole="link"
                >
                  {t("auth.privacyLinkText")}
                </ThemedText>
                .
              </ThemedText>
            </View>
          </Pressable>

          {acceptMutation.isError ? (
            <ThemedText style={styles.error}>{t("consents.updateError")}</ThemedText>
          ) : null}

          <Pressable
            onPress={() => acceptMutation.mutate()}
            disabled={!checked || busy}
            style={({ pressed }) => [
              styles.cta,
              pressed && checked && !busy && { backgroundColor: colors.accentHover },
              (!checked || busy) && { opacity: 0.55 },
            ]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.ctaText}>
              {busy ? `${t("consents.gateContinue")}…` : t("consents.gateContinue")}
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => void signOut()}
            disabled={busy}
            style={styles.logout}
            accessibilityRole="button"
          >
            <ThemedText style={styles.logoutText}>{t("auth.navLogout")}</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[5],
  },
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: spacing[5],
    gap: spacing[4],
  },
  title: {
    fontSize: 20,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  body: {
    marginTop: -spacing[2],
    fontSize: 13.5,
    lineHeight: 19,
    color: "rgba(255,255,255,0.62)",
  },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[2] },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "#16161A",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  consentLabel: {
    fontSize: 12.5,
    fontFamily: fontFamily.bodyMedium,
    lineHeight: 17,
    color: "rgba(255,255,255,0.72)",
  },
  consentLink: {
    color: colors.accent,
    fontFamily: fontFamily.bodySemibold,
    textDecorationLine: "underline",
  },
  error: { fontSize: 12.5, lineHeight: 17, color: "#F87171", marginTop: -spacing[2] },
  cta: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  logout: { alignItems: "center", padding: spacing[1] },
  logoutText: {
    fontSize: 13,
    fontFamily: fontFamily.bodySemibold,
    color: "rgba(255,255,255,0.55)",
  },
});
