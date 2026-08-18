import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { getOrderReviewPrompt, skipOrderReview, submitOrderReview } from "@/services/api/orderReviews";
import { useActiveOrder } from "@/features/order/useActiveOrder";
import { dismissFeedbackForSession, useFeedbackSession } from "./feedbackSession";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

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
 *  - "Inte nu" is remembered PER ORDER, server-side (locked product rule:
 *    max one prompt per order). The idempotent skip endpoint writes a
 *    Skipped row, so the same order never asks again — on any device or
 *    after any restart. Only a NEW qualifying delivered order can prompt.
 *    The session store remains as the same-session guard and as the
 *    network-failure fallback: if the skip call fails, this session stays
 *    silent and the server may offer the order once more next session.
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
  const closeOrderIdRef = useRef<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const completeClose = () => {
    if (closeReasonRef.current === null) return; // already completed
    const reason = closeReasonRef.current;
    const orderId = closeOrderIdRef.current;
    closeReasonRef.current = null;
    closeOrderIdRef.current = null;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (reason === "dismiss" && orderId) {
      // Locked product rule: max ONE prompt per order. "Inte nu" is written
      // server-side via the idempotent per-order skip, so this order never
      // prompts again on any device. Fire-and-forget AFTER the native modal
      // has closed — a network failure only means the next app session may
      // ask once more; the session dismissal below still silences this one.
      void skipOrderReview(orderId).catch(() => {});
    }
    void queryClient.invalidateQueries({ queryKey: ["orderReviews"] });
    dismissFeedbackForSession();
  };

  const beginClose = (reason: "dismiss" | "submitted") => {
    if (closing) return; // double-taps close once
    closeReasonRef.current = reason;
    closeOrderIdRef.current = prompt?.orderId ?? null;
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
      animationType="fade"
      onRequestClose={notNow}
      onDismiss={completeClose}
    >
      {/* Centered compact CARD (physical-QA redesign) — not a bottom sheet.
          No ScrollView in the normal path: the card is small enough to fit
          any normal iPhone with the keyboard closed; maxHeight is the only
          tiny-screen fallback, and KeyboardAvoidingView lifts the card when
          the comment field opens. */}
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.avoider}
        >
          <View style={styles.card}>
              <View style={styles.headRow}>
                <View style={styles.headText}>
                  <ThemedText style={styles.introTitle}>{t("foodReview.title")}</ThemedText>
                  {/* The review target's meal (server-chosen), never a random
                      cart item — prompt.firstMealTitle IS the review target. */}
                  <ThemedText style={styles.introBody} numberOfLines={2}>
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
                      size={24}
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

              {/* No explainer paragraph — the label carries itself, and every
                  saved line is vertical budget on a phone. Never pre-selected. */}
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <ThemedText variant="bodyMedium" style={styles.switchLabel}>
                    {t("foodReview.marketing")}
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
    justifyContent: "center",
    alignItems: "center",
    padding: spacing[5],
  },
  avoider: { width: "100%", maxWidth: 400, alignItems: "stretch" },
  // Centered compact card. NO ScrollView: everything — intro, stars,
  // comment, both consent rows, Submit and "Inte nu" — fits a normal
  // iPhone with the keyboard closed; maxHeight only clips on extreme
  // accessibility sizes, and the keyboard lifts the whole card.
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card * 2,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
    maxHeight: "92%",
  },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  headText: { flex: 1, gap: 2 },
  // Deliberately small: the heading is a thank-you line, not a hero title —
  // the vertical budget belongs to the interactive rows below it.
  introTitle: { fontSize: 15.5, fontFamily: fontFamily.bodyBold, lineHeight: 20 },
  introBody: { fontSize: 13, lineHeight: 17, color: colors.textSecondary },
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
    marginVertical: spacing[2],
  },
  starBtn: { padding: spacing[1] },
  input: {
    minHeight: 56,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    color: colors.textPrimary,
    padding: spacing[3],
    textAlignVertical: "top",
    marginBottom: spacing[2],
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: 2,
  },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 13, lineHeight: 17 },
  error: { color: colors.error, marginTop: spacing[2] },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: radius.btn,
    alignItems: "center",
    paddingVertical: spacing[3],
    marginTop: spacing[2],
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: "#FFFFFF" },
  // "Inte nu" stays SECONDARY (plain text, no fill) but must be clearly
  // readable: primary text color + semibold, and enough padding for a
  // proper touch target.
  laterBtn: { alignItems: "center", paddingVertical: spacing[3] },
  laterText: {
    fontSize: 13.5,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
  },
});
