import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/hooks/useAuth";
import { getMyConsents } from "@/services/api/consents";
import { getOrderReviewPrompt, submitOrderReview } from "@/services/api/orderReviews";
import { useActiveOrder } from "@/features/order/useActiveOrder";
import { dismissFeedbackForSession, useFeedbackSession } from "./feedbackSession";
import { useTranslation } from "@/i18n";
import { colors, radius, spacing } from "@/theme";

/**
 * "Hur smakade maten?" — asked on the NEXT app session after a delivered
 * order.
 *
 * WHO DECIDES WHAT. The backend owns eligibility (delivered, recent,
 * unreviewed, no order in flight — see /api/order-reviews/prompt). This
 * component adds only the SESSION timing:
 *
 *  - the order must have been delivered BEFORE the current session started
 *    (feedbackSession.ts: cold start or background→foreground), so the
 *    sheet never chases the customer straight out of pickup and always
 *    waits for a later opening,
 *  - "Inte nu" dismisses for THIS SESSION ONLY — nothing is stored
 *    server-side, so the next app session may ask again. (The permanent
 *    skip endpoint still exists server-side; it is deliberately NOT wired
 *    to "Inte nu", whose wording promises another chance.)
 *
 * Marketing consent is a separate switch and starts OFF. Always.
 */

const MAX_COMMENT = 1000;

export function FoodFeedbackPrompt() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isActive: hasActiveOrder } = useActiveOrder();

  // The app session, robustly (AppState-backed) — not component state.
  const session = useFeedbackSession();

  const consentsQuery = useQuery({
    queryKey: ["consents", "me"],
    queryFn: getMyConsents,
    enabled: !!user,
    staleTime: 60_000,
  });

  const promptQuery = useQuery({
    queryKey: ["orderReviews", "prompt", user?.id ?? null],
    queryFn: getOrderReviewPrompt,
    enabled:
      !!user &&
      !session.dismissed &&
      !hasActiveOrder &&
      consentsQuery.data?.requiresAcceptance === false,
    staleTime: 5 * 60_000,
  });

  const prompt = promptQuery.data ?? null;

  // Delivered BEFORE this session began — the exact "next app session"
  // requirement, replacing the old fixed one-hour age heuristic.
  const deliveredBeforeSession = useMemo(() => {
    if (!prompt) return false;
    const delivered = new Date(prompt.deliveredAt).getTime();
    return Number.isFinite(delivered) && delivered < session.startedAt;
  }, [prompt, session.startedAt]);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  // NEVER pre-selected — an active opt-in or nothing.
  const [allowMarketingUse, setAllowMarketingUse] = useState(false);
  const [error, setError] = useState(false);
  const sendingRef = useRef(false);

  // ── Modal close lifecycle ─────────────────────────────────────────────
  // The sheet must NEVER be unmounted while the native modal is still
  // presented: flipping the session store immediately re-renders this
  // component to null, and tearing down a visible transparent Modal
  // mid-presentation leaves its window eating every touch — the app looks
  // frozen. So closing is two-phase: visible={false} starts the native
  // dismissal, and ONLY when it has finished (onDismiss on iOS, the timer
  // everywhere as fallback — Android has no onDismiss) does completeClose
  // flip the session store and let the component unmount.
  const [closing, setClosing] = useState(false);
  const closeReasonRef = useRef<"dismiss" | "submitted" | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const completeClose = () => {
    if (closeReasonRef.current === null) return; // already completed
    const reason = closeReasonRef.current;
    closeReasonRef.current = null;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (reason === "submitted") {
      void queryClient.invalidateQueries({ queryKey: ["orderReviews"] });
    }
    dismissFeedbackForSession();
  };

  const beginClose = (reason: "dismiss" | "submitted") => {
    if (closing) return; // double-taps close once
    closeReasonRef.current = reason;
    setClosing(true);
    closeTimerRef.current = setTimeout(completeClose, Platform.OS === "ios" ? 600 : 120);
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    []
  );

  const submitMutation = useMutation({
    mutationFn: submitOrderReview,
    onSuccess: () => beginClose("submitted"),
    onError: () => {
      sendingRef.current = false;
      setError(true);
    },
  });

  // "Inte nu" — session-only, by design. NO server call: a permanent
  // Skipped row would mean the customer is never asked again, which is not
  // what "not now" says. The next app session simply asks again (until the
  // 14-day server window closes).
  const notNow = () => {
    beginClose("dismiss");
  };

  if (!user || session.dismissed || hasActiveOrder || !prompt || !deliveredBeforeSession) {
    return null;
  }

  const submit = () => {
    if (rating < 1 || sendingRef.current || closing) return;
    sendingRef.current = true;
    setError(false);
    submitMutation.mutate({
      orderId: prompt.orderId,
      rating,
      comment: comment.trim() || undefined,
      isAnonymous,
      allowMarketingUse,
    });
  };

  return (
    <Modal
      visible={!closing}
      transparent
      animationType="slide"
      onRequestClose={notNow}
      onDismiss={completeClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.avoider}
        >
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
              <View style={styles.headRow}>
                <View style={styles.headText}>
                  <ThemedText variant="title">{t("foodReview.title")}</ThemedText>
                  <ThemedText variant="caption" style={styles.subtitle}>
                    {prompt.firstMealTitle
                      ? t("foodReview.subtitleMeal", { meal: prompt.firstMealTitle })
                      : t("foodReview.subtitle")}
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("foodReview.close")}
                  onPress={notNow}
                  style={styles.closeBtn}
                >
                  <X size={16} color={colors.textSecondary} strokeWidth={2.25} />
                </Pressable>
              </View>

              {/* ── Stars ── */}
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={t("foodReview.starLabel", { value })}
                    onPress={() => setRating(value)}
                    style={styles.starBtn}
                  >
                    <Star
                      size={28}
                      color={value <= rating ? colors.accent : colors.textMuted}
                      fill={value <= rating ? colors.accent : "transparent"}
                      strokeWidth={1.75}
                    />
                  </Pressable>
                ))}
              </View>

              <TextInput
                value={comment}
                onChangeText={(v) => setComment(v.slice(0, MAX_COMMENT))}
                placeholder={t("foodReview.commentPlaceholder")}
                placeholderTextColor={colors.textTertiary}
                multiline
                style={styles.input}
                maxLength={MAX_COMMENT}
              />

              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <ThemedText variant="bodyMedium" style={styles.switchLabel}>
                    {t("foodReview.anonymous")}
                  </ThemedText>
                </View>
                <Switch value={isAnonymous} onValueChange={setIsAnonymous} />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <ThemedText variant="bodyMedium" style={styles.switchLabel}>
                    {t("foodReview.marketing")}
                  </ThemedText>
                  <ThemedText variant="caption" style={styles.switchHint}>
                    {t("foodReview.marketingHint")}
                  </ThemedText>
                </View>
                <Switch value={allowMarketingUse} onValueChange={setAllowMarketingUse} />
              </View>

              {error && (
                <ThemedText variant="caption" style={styles.error}>
                  {t("foodReview.error")}
                </ThemedText>
              )}

              <Pressable
                accessibilityRole="button"
                disabled={rating < 1 || submitMutation.isPending}
                onPress={submit}
                style={[
                  styles.submit,
                  (rating < 1 || submitMutation.isPending) && styles.submitDisabled,
                ]}
              >
                <ThemedText variant="bodyMedium" style={styles.submitText}>
                  {submitMutation.isPending
                    ? t("foodReview.sending")
                    : t("foodReview.submit")}
                </ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={notNow}
                style={styles.laterBtn}
              >
                <ThemedText variant="caption" style={styles.laterText}>
                  {t("foodReview.notNow")}
                </ThemedText>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  avoider: { width: "100%" },
  // Compact on purpose: title, stars, comment, both switches, Submit and
  // "Inte nu" must all fit a normal iPhone height WITHOUT scrolling (the
  // ScrollView stays only as a keyboard/small-screen fallback).
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card * 2,
    borderTopRightRadius: radius.card * 2,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
    maxHeight: "88%",
  },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  headText: { flex: 1, gap: spacing[1] },
  subtitle: { color: colors.textSecondary },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardAlt,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing[2],
    marginVertical: spacing[3],
  },
  starBtn: { padding: spacing[1] },
  input: {
    minHeight: 60,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    color: colors.textPrimary,
    padding: spacing[3],
    textAlignVertical: "top",
    marginBottom: spacing[3],
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[1],
  },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 14 },
  switchHint: { color: colors.textTertiary, marginTop: 2 },
  error: { color: colors.error, marginTop: spacing[2] },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: radius.btn,
    alignItems: "center",
    paddingVertical: spacing[3],
    marginTop: spacing[3],
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: "#FFFFFF" },
  laterBtn: { alignItems: "center", paddingVertical: spacing[2] },
  laterText: { color: colors.textSecondary },
});
