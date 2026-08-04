import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, CheckCircle2 } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import {
  submitAppFeedback,
  type AppFeedbackReproducibility,
  type AppFeedbackType,
} from "@/services/api/appFeedback";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Feedback / problem-report form (patch 6) — ONE screen for both types,
 * mounted by the thin routes /feedback and /rapportera-problem. Message is
 * required; title optional; bug reports add "what were you trying to do?"
 * (optional) and a Yes/No/Unknown reproducibility choice (optional).
 *
 * Double-submit is impossible (a ref + pending state gate the mutation),
 * a failed send keeps every field intact with a retryable error, and
 * success swaps the form for a clear thank-you state whose only action
 * navigates back. Only app version / platform / OS version ride along as
 * metadata (see services/api/appFeedback).
 */
export function FeedbackFormScreen({ type }: { type: AppFeedbackType }) {
  const router = useRouter();
  const { t } = useTranslation();
  const isBug = type === "BugReport";

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [attempted, setAttempted] = useState("");
  const [reproducibility, setReproducibility] =
    useState<AppFeedbackReproducibility | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const sendingRef = useRef(false);

  const canSubmit = message.trim().length > 0 && !sending;

  const goBack = () => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"));

  const submit = async () => {
    if (sendingRef.current || !message.trim()) return;
    sendingRef.current = true;
    setSending(true);
    setFailed(false);
    try {
      await submitAppFeedback({
        type,
        title: title.trim(),
        message: message.trim(),
        attemptedAction: isBug && attempted.trim() ? attempted.trim() : undefined,
        reproducibility: isBug && reproducibility ? reproducibility : undefined,
      });
      setDone(true);
    } catch {
      setFailed(true); // Fields stay intact — the button retries.
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  if (done) {
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={styles.doneWrap}>
          <CheckCircle2 size={44} color={colors.success} strokeWidth={1.6} />
          <ThemedText accessibilityRole="header" style={styles.doneTitle}>
            {isBug ? t("appFeedback.doneBugTitle") : t("appFeedback.doneTitle")}
          </ThemedText>
          <ThemedText style={styles.doneBody}>
            {isBug ? t("appFeedback.doneBugBody") : t("appFeedback.doneBody")}
          </ThemedText>
          <Button
            label={t("appFeedback.doneClose")}
            onPress={goBack}
            accessibilityLabel={t("appFeedback.doneClose")}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            hitSlop={8}
          >
            <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>
            {isBug ? t("appFeedback.bugTitle") : t("appFeedback.feedbackTitle")}
          </ThemedText>
          <View style={styles.backButton} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText style={styles.intro}>
            {isBug ? t("appFeedback.bugIntro") : t("appFeedback.feedbackIntro")}
          </ThemedText>

          <View style={styles.field}>
            <ThemedText style={styles.label}>
              {t("appFeedback.titleLabel")}{" "}
              <ThemedText style={styles.optional}>{t("appFeedback.optional")}</ThemedText>
            </ThemedText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={styles.input}
              placeholder={t("appFeedback.titlePlaceholder")}
              placeholderTextColor={colors.textMuted}
              maxLength={150}
              editable={!sending}
            />
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>
              {isBug ? t("appFeedback.bugMessageLabel") : t("appFeedback.feedbackMessageLabel")}
            </ThemedText>
            <TextInput
              value={message}
              onChangeText={setMessage}
              style={[styles.input, styles.multiline]}
              placeholder={
                isBug
                  ? t("appFeedback.bugMessagePlaceholder")
                  : t("appFeedback.feedbackMessagePlaceholder")
              }
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={4000}
              editable={!sending}
            />
          </View>

          {isBug ? (
            <>
              <View style={styles.field}>
                <ThemedText style={styles.label}>
                  {t("appFeedback.attemptedLabel")}{" "}
                  <ThemedText style={styles.optional}>{t("appFeedback.optional")}</ThemedText>
                </ThemedText>
                <TextInput
                  value={attempted}
                  onChangeText={setAttempted}
                  style={[styles.input, styles.multilineSmall]}
                  placeholder={t("appFeedback.attemptedPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  textAlignVertical="top"
                  maxLength={2000}
                  editable={!sending}
                />
              </View>

              <View style={styles.field}>
                <ThemedText style={styles.label}>{t("appFeedback.reproLabel")}</ThemedText>
                <View style={styles.reproRow}>
                  {(["Yes", "No", "Unknown"] as const).map((key) => {
                    const selected = reproducibility === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setReproducibility(selected ? null : key)}
                        disabled={sending}
                        style={[styles.reproChip, selected && styles.reproChipSelected]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={t(`appFeedback.repro${key}`)}
                      >
                        {selected ? (
                          <Check size={12} color={colors.accent} strokeWidth={2.5} />
                        ) : null}
                        <ThemedText
                          style={[styles.reproText, selected && styles.reproTextSelected]}
                        >
                          {t(`appFeedback.repro${key}`)}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}

          <ThemedText style={styles.privacyNote}>{t("appFeedback.privacyNote")}</ThemedText>

          {failed ? (
            <ThemedText style={styles.error}>{t("appFeedback.error")}</ThemedText>
          ) : null}

          <Button
            label={sending ? `${t("appFeedback.send")}…` : t("appFeedback.send")}
            loading={sending}
            disabled={!canSubmit}
            onPress={submit}
            accessibilityLabel={t("appFeedback.send")}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  content: { padding: spacing[5], gap: spacing[4], paddingBottom: spacing[8] },
  intro: { fontSize: 13.5, lineHeight: 19, color: colors.textSecondary },
  field: { gap: spacing[2] },
  label: {
    fontSize: 12.5,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
  },
  optional: { fontSize: 11.5, color: colors.textTertiary, fontFamily: fontFamily.body },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.btn,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: 14,
    fontFamily: fontFamily.body,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 120 },
  multilineSmall: { minHeight: 80 },
  reproRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  reproChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  reproChipSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  reproText: { fontSize: 12.5, color: colors.textSecondary },
  reproTextSelected: { color: colors.accent, fontFamily: fontFamily.bodySemibold },
  privacyNote: { fontSize: 11.5, lineHeight: 16, color: colors.textTertiary },
  error: { fontSize: 12.5, lineHeight: 17, color: colors.error },
  doneWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
    gap: spacing[4],
  },
  doneTitle: {
    fontSize: 22,
    fontFamily: fontFamily.headlineExtrabold,
    letterSpacing: -0.5,
    color: colors.textPrimary,
    textAlign: "center",
  },
  doneBody: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: -spacing[2],
  },
});
