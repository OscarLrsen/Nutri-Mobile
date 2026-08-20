import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, TriangleAlert } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { deleteMyAccount } from "@/services/api/account";
import { useAuth } from "@/services/auth/AuthProvider";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * "Radera mitt konto" — the app had no way to do this at all.
 *
 * DELIBERATELY SECONDARY. It sits at the very bottom, below sign-out, as
 * plain destructive text rather than a button: nobody should be able to
 * delete an account by fat-fingering a large red CTA on the way past.
 *
 * The server does the deleting (DELETE /api/account). This screen never
 * touches Supabase auth itself — the app has no service-role key, and a
 * client-side "delete" that only signs out would leave the account alive
 * while telling the customer it was gone.
 *
 * FAILURE LEAVES EVERYTHING INTACT. The session is cleared only after the
 * server confirms 204. On any error the customer stays signed in with their
 * data untouched and sees why, because a half-cleared client on top of a
 * live account is the worst of both outcomes.
 */
export function DeleteAccountSection() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Belt and braces with `busy`: state updates are async, so a fast double
  // tap can enter this handler twice before the re-render disables anything.
  const inFlightRef = useRef(false);

  const close = () => {
    if (busy) return; // never dismiss mid-delete
    setOpen(false);
    setAcknowledged(false);
    setError("");
  };

  const confirmDelete = async () => {
    if (!acknowledged || inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setError("");
    try {
      await deleteMyAccount();

      // Order matters. The account is gone on the server, so every cached
      // answer about it is now a lie — drop the whole cache before the
      // sign-out re-renders the app, or a stale user-scoped screen can paint
      // one last time on the way out.
      queryClient.clear();
      await signOut();

      // Say where to go rather than trusting the guard to fall somewhere
      // sensible. Signing out drops every guarded screen and the navigator
      // lands on whichever route is still standing — which is exactly how a
      // deleted account ended up parked on the auth/callback screen. The
      // guard ordering is fixed, but the outcome of deleting an account
      // should not depend on fallback semantics at all.
      router.replace("/logga-in");
    } catch {
      setError(t("account.deleteError"));
      setBusy(false);
      inFlightRef.current = false;
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={t("account.deleteTitle")}
      >
        <ThemedText style={styles.triggerText}>{t("account.deleteTitle")}</ThemedText>
      </Pressable>

      {open && (
        <Modal visible transparent animationType="fade" onRequestClose={close}>
          <View style={styles.backdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            />
            <View style={styles.card}>
              <View style={styles.iconWrap}>
                <TriangleAlert size={20} color={colors.error} strokeWidth={2.2} />
              </View>

              <ThemedText style={styles.title}>{t("account.deleteConfirmTitle")}</ThemedText>
              <ThemedText style={styles.body}>{t("account.deleteConfirmBody")}</ThemedText>
              <ThemedText style={styles.bodyStrong}>{t("account.deleteIrreversible")}</ThemedText>

              {/* The explicit confirmation. The destructive button stays
                  inert until this is ticked, so "delete my account" is
                  always two deliberate actions, never one stray tap. */}
              <Pressable
                onPress={() => setAcknowledged((v) => !v)}
                disabled={busy}
                style={styles.ackRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acknowledged, disabled: busy }}
                accessibilityLabel={t("account.deleteAcknowledge")}
              >
                <View style={[styles.checkbox, acknowledged && styles.checkboxOn]}>
                  {acknowledged ? (
                    <Check size={12} color={colors.textPrimary} strokeWidth={3} />
                  ) : null}
                </View>
                <ThemedText style={styles.ackText}>{t("account.deleteAcknowledge")}</ThemedText>
              </Pressable>

              {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

              <Pressable
                onPress={confirmDelete}
                disabled={!acknowledged || busy}
                style={({ pressed }) => [
                  styles.destructive,
                  (!acknowledged || busy) && styles.destructiveDisabled,
                  pressed && acknowledged && !busy && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !acknowledged || busy }}
              >
                <ThemedText style={styles.destructiveText}>
                  {busy ? t("account.deleting") : t("account.deleteConfirmCta")}
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={close}
                disabled={busy}
                style={styles.cancel}
                accessibilityRole="button"
              >
                <ThemedText style={[styles.cancelText, busy && { opacity: 0.4 }]}>
                  {t("common.cancel")}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { alignSelf: "center", paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  triggerText: { fontSize: 12, color: colors.error, opacity: 0.85 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[5],
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing[5],
    gap: spacing[3],
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
  },
  title: { fontSize: 18, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  body: { fontSize: 13.5, lineHeight: 19, color: colors.textSecondary },
  bodyStrong: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
  },
  ackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.error, borderColor: colors.error },
  ackText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  error: { fontSize: 12.5, lineHeight: 17, color: colors.error },
  destructive: {
    height: 48,
    borderRadius: radius.btn,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  destructiveDisabled: { backgroundColor: "rgba(255,255,255,0.08)" },
  destructiveText: { fontSize: 14, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  cancel: { height: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, color: colors.textSecondary },
});
