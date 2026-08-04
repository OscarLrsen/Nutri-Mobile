import { useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import { getMyConsents } from "@/services/api/consents";
import {
  SURVEY_DISCOVERY_KEYS,
  SURVEY_REASON_KEYS,
  getOnboardingSurveyStatus,
  skipOnboardingSurvey,
  submitOnboardingSurvey,
} from "@/services/api/onboardingSurvey";
import { getIntroSeenCached, subscribeIntroSeen } from "@/features/onboarding/introStorage";
import {
  isAnyNudgeOverlayActive,
  subscribeNudgeOverlayActivity,
} from "@/features/overlays/overlayActivity";
import { useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Onboarding survey overlay (patch 4) — two questions after the first real
 * (verified) login, shown at most once; the BACKEND decides who sees it
 * (shouldShow from GET /api/onboarding-survey/me) and records answer/skip
 * idempotently. Fail-open: a failed status fetch simply never shows the
 * survey this session (retry: 1, then silence — the app is never blocked).
 *
 * DOCUMENTED OVERLAY PRIORITY: this is a plain full-screen View (NOT an RN
 * Modal), mounted after the Stack but before FirstRunOnboardingGate, so:
 * - ConsentGateModal (RN Modal) always renders ABOVE it natively — the
 *   consent gate strictly wins.
 * - WelcomeCoupon / SpinNudge report their visibility through the shared
 *   overlayActivity signal: while either is active the survey is HIDDEN
 *   (display:none — kept mounted, so the user's selections survive) and
 *   resumes when the nudge closes.
 * - The first-run intro gate (mounted later + the introSeen subscription
 *   below) always covers it, so intro and survey can never show together.
 * Visibility additionally requires consent state to be KNOWN safe
 * (requiresAcceptance === false), never assumed.
 */
export function OnboardingSurveyOverlay() {
  const { user } = useAuth();
  const introSeen = useSyncExternalStore(subscribeIntroSeen, getIntroSeenCached);
  const nudgeActive = useSyncExternalStore(
    subscribeNudgeOverlayActivity,
    isAnyNudgeOverlayActive
  );

  const consentsQuery = useQuery({
    queryKey: ["consents", "me"],
    queryFn: getMyConsents,
    enabled: !!user,
    staleTime: 60_000,
  });
  const surveyQuery = useQuery({
    queryKey: ["onboardingSurvey", "me"],
    queryFn: getOnboardingSurveyStatus,
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });

  const eligible =
    !!user &&
    introSeen === true &&
    consentsQuery.data?.requiresAcceptance === false &&
    surveyQuery.data?.shouldShow === true;

  if (!eligible) return null;

  // While a nudge modal is up the survey is HIDDEN but stays MOUNTED —
  // display:none keeps step/selection state alive, so a nudge appearing
  // mid-survey never loses what the user already picked.
  return (
    <View
      style={[StyleSheet.absoluteFill, nudgeActive && styles.waiting]}
      pointerEvents={nudgeActive ? "none" : "auto"}
    >
      {/* Keyed per user so a mid-survey logout/login never leaks selections. */}
      <SurveyCard key={user.id} />
    </View>
  );
}

function SurveyCard() {
  const { t } = useTranslation();
  // Recorded with the answers so admin can read them in the language they
  // were given in.
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);

  const submitMutation = useMutation({
    mutationFn: () =>
      submitOnboardingSurvey({ discoverySource: source!, choiceReasons: reasons, language }),
    onSuccess: (data) => queryClient.setQueryData(["onboardingSurvey", "me"], data),
  });
  const skipMutation = useMutation({
    mutationFn: skipOnboardingSurvey,
    onSuccess: (data) => queryClient.setQueryData(["onboardingSurvey", "me"], data),
  });
  // Double-taps cannot double-send: both actions are inert while pending,
  // and closing happens ONLY from the server response (setQueryData above
  // flips shouldShow to false) — never from optimistic local state.
  const busy = submitMutation.isPending || skipMutation.isPending;
  const failed = submitMutation.isError || skipMutation.isError;

  const toggleReason = (key: string) =>
    setReasons((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
    );

  return (
    <View style={StyleSheet.absoluteFill}>
      <Screen edges={["top", "bottom"]}>
        {/* Top row: back (step 2) · progress · skip */}
        <View style={styles.topRow}>
          {step === 2 ? (
            <Pressable
              onPress={() => setStep(1)}
              disabled={busy}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
              hitSlop={8}
            >
              <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
            </Pressable>
          ) : (
            <View style={styles.backButton} />
          )}
          <ThemedText
            style={styles.progress}
            accessibilityLabel={t("survey.progress", { current: step, total: 2 })}
          >
            {t("survey.progress", { current: step, total: 2 })}
          </ThemedText>
          <Pressable
            onPress={() => !busy && skipMutation.mutate()}
            disabled={busy}
            style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t("survey.skip")}
            hitSlop={8}
          >
            <ThemedText style={styles.skipText}>{t("survey.skip")}</ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText accessibilityRole="header" style={styles.question}>
            {step === 1 ? t("survey.q1Title") : t("survey.q2Title")}
          </ThemedText>
          <ThemedText style={styles.hint}>
            {step === 1 ? t("survey.q1Hint") : t("survey.q2Hint")}
          </ThemedText>

          <View style={styles.optionList}>
            {step === 1
              ? SURVEY_DISCOVERY_KEYS.map((key) => (
                  <OptionRow
                    key={key}
                    label={t(`survey.q1.${key}`)}
                    selected={source === key}
                    role="radio"
                    disabled={busy}
                    onPress={() => setSource(key)}
                  />
                ))
              : SURVEY_REASON_KEYS.map((key) => (
                  <OptionRow
                    key={key}
                    label={t(`survey.q2.${key}`)}
                    selected={reasons.includes(key)}
                    role="checkbox"
                    disabled={busy}
                    onPress={() => toggleReason(key)}
                  />
                ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {failed ? (
            <ThemedText style={styles.error}>{t("survey.error")}</ThemedText>
          ) : null}
          <Button
            label={step === 1 ? t("survey.next") : t("survey.submit")}
            loading={busy}
            disabled={busy || (step === 1 ? source === null : reasons.length === 0)}
            onPress={() => (step === 1 ? setStep(2) : submitMutation.mutate())}
            accessibilityLabel={step === 1 ? t("survey.next") : t("survey.submit")}
          />
        </View>
      </Screen>
    </View>
  );
}

function OptionRow({
  label,
  selected,
  role,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  role: "radio" | "checkbox";
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.option, selected && styles.optionSelected]}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      <ThemedText style={[styles.optionText, selected && styles.optionTextSelected]}>
        {label}
      </ThemedText>
      {selected ? <Check size={16} color={colors.accent} strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  progress: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: colors.textTertiary },
  skipButton: { paddingVertical: spacing[2], paddingHorizontal: spacing[2] },
  skipText: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, color: colors.textSecondary },

  content: { padding: spacing[5], paddingTop: spacing[6], gap: spacing[2] },
  question: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fontFamily.headlineExtrabold,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  hint: { fontSize: 12.5, lineHeight: 17, color: colors.textTertiary },
  optionList: { marginTop: spacing[3], gap: spacing[2] },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  optionSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  optionTextSelected: { fontFamily: fontFamily.bodySemibold },
  error: { fontSize: 12.5, lineHeight: 17, color: colors.error, textAlign: "center" },
  footer: { padding: spacing[5], gap: spacing[3] },
  waiting: { display: "none" },
});
