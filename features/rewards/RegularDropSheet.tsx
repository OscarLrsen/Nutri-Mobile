import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ImageOff, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { pickLang, useLanguage, useTranslation } from "@/i18n";
import {
  regularDropKeys,
  useActiveRegularDropQuery,
  useRegularDropVote,
  type ApiRegularDropOption,
} from "@/services/api/regularDrops";
import { parseRegularDropError, type RegularDropApiErrorCode } from "@/utils/regularDropErrors";
import { RegularDropResults } from "@/features/home/RegularDropResults";
import { getDropCountdown, sortDropOptions, type DropCountdown } from "@/features/home/regularDropHelpers";
import {
  isRetryableVoteError,
  isStaleDataVoteError,
  resolveVotedOption,
  voteErrorI18nKey,
} from "@/features/home/regularDropVoteHelpers";
import { colors, fontFamily, radius, spacing } from "@/theme";
import type { TFunction } from "i18next";

import { canConfirmSelection, selectDropOption } from "./regularDropSelection";

/**
 * The Regular Drop poll, moved from the Home feed to Weekly Drops: opened
 * from the rewards header action, shown as a bottom sheet.
 *
 * Selection flow (phase 11): tapping a card only updates the LOCAL
 * selection — exactly one card selected, tapping another moves the mark,
 * no POST. The confirm button (disabled until a selection exists) leads to
 * the confirmation step, and only its explicit confirm fires exactly one
 * POST (lock-ref + busy). The server response stays the sole truth: a
 * registered vote can never be changed, duplicate/two-device answers show
 * the ORIGINAL vote, and ended polls render the server's final result.
 */

const IMAGE_ASPECT = 3 / 2;

function countdownLabel(countdown: DropCountdown, t: TFunction): string | null {
  switch (countdown.unit) {
    case "day":
      return t("regularDrops.endsIn", { time: t("regularDrops.days", { count: countdown.count }) });
    case "hour":
      return t("regularDrops.endsIn", { time: t("regularDrops.hours", { count: countdown.count }) });
    case "minute":
      return t("regularDrops.endsIn", {
        time: t("regularDrops.minutes", { count: countdown.count }),
      });
    case "ended":
      return t("regularDrops.ended");
    default:
      return null;
  }
}

export function RegularDropSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const query = useActiveRegularDropQuery();
  const vote = useRegularDropVote();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState<"list" | "confirm" | "success">("list");
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<RegularDropApiErrorCode | null>(null);
  const [votedName, setVotedName] = useState<string | null>(null);
  const lockRef = useRef(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const poll = query.data?.poll ?? null;
  const options = poll ? sortDropOptions(poll.options) : [];
  const selectedOption = options.find((o) => o.id === selectedId) ?? null;
  const isEnded = !!poll && poll.isEnded && poll.result !== null;

  const handleDismiss = () => {
    if (busy) return;
    onClose();
  };

  /** Stale server data (poll closed/changed under us): reset local state and
   * refetch — the sheet re-renders on the server's new truth. Never fakes
   * poll null and never shows success. */
  const handleStale = () => {
    setSelectedId(null);
    setStep("list");
    setErrorCode(null);
    queryClient.invalidateQueries({ queryKey: regularDropKeys.all });
  };

  const handleConfirmVote = async () => {
    if (lockRef.current || busy || !poll || !selectedOption) return;
    lockRef.current = true;
    setBusy(true);
    setErrorCode(null);
    try {
      const response = await vote(poll.id, selectedOption.id);
      const serverOption = resolveVotedOption(response);
      setVotedName(
        serverOption
          ? pickLang(
              { sv: serverOption.nameSv, en: serverOption.nameEn, da: serverOption.nameDa },
              language
            )
          : null
      );
      setStep("success");
    } catch (err) {
      const parsed = parseRegularDropError(err);
      if (isStaleDataVoteError(parsed.code)) {
        handleStale();
        return;
      }
      setErrorCode(parsed.code);
    } finally {
      setBusy(false);
      lockRef.current = false;
    }
  };

  const countdown = poll && poll.isActive ? getDropCountdown(poll.endsAt, nowMs) : null;
  const countdownText = countdown ? countdownLabel(countdown, t) : null;
  const retryable = errorCode !== null && isRetryableVoteError(errorCode);

  const pollTitle = poll
    ? pickLang({ sv: poll.titleSv, en: poll.titleEn, da: poll.titleDa }, language)
    : "";
  const showPollTitle =
    pollTitle.trim().length > 0 &&
    pollTitle.trim().toLowerCase() !== t("regularDrops.title").trim().toLowerCase();

  const votedOption =
    poll && poll.hasVoted ? (options.find((o) => o.id === poll.votedOptionId) ?? null) : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={handleDismiss}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleDismiss}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <ThemedText style={styles.title} accessibilityRole="header">
              {step === "success"
                ? t("regularDrops.voteRegistered")
                : isEnded
                  ? t("regularDrops.results")
                  : t("regularDrops.title")}
            </ThemedText>
            <Pressable
              onPress={handleDismiss}
              disabled={busy}
              style={[styles.closeButton, busy && { opacity: 0.4 }]}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              accessibilityState={{ disabled: busy }}
            >
              <X size={13} color={colors.accent} strokeWidth={1.7} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {query.isLoading ? (
              <View
                style={{ gap: spacing[3] }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Skeleton height={140} />
                <Skeleton height={140} />
              </View>
            ) : query.isError ? (
              <>
                <View style={styles.errorBox} accessibilityRole="alert">
                  <AlertCircle size={14} color={colors.error} strokeWidth={2} />
                  <ThemedText style={styles.errorText}>
                    {t("regularDrops.errors.unknown")}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => query.refetch()}
                  style={styles.secondaryButton}
                  accessibilityRole="button"
                  accessibilityLabel={t("regularDrops.retry")}
                >
                  <ThemedText style={styles.secondaryButtonText}>
                    {t("regularDrops.retry")}
                  </ThemedText>
                </Pressable>
              </>
            ) : !poll ? (
              <ThemedText style={styles.mutedCenter}>{t("regularDrops.ended")}</ThemedText>
            ) : isEnded ? (
              <RegularDropResults poll={poll} />
            ) : step === "success" ? (
              <View style={{ gap: spacing[3] }} accessibilityLiveRegion="polite">
                <View style={styles.successIcon}>
                  <Check size={26} color="rgb(90,210,140)" strokeWidth={2.4} />
                </View>
                {votedName ? (
                  <ThemedText style={styles.successVotedFor}>
                    {t("regularDrops.youVotedFor")}{" "}
                    <ThemedText style={styles.successVotedName}>{votedName}</ThemedText>
                  </ThemedText>
                ) : null}
                <ThemedText style={styles.successThanks}>{t("regularDrops.thankYou")}</ThemedText>
                <ThemedText style={styles.lockedNotice}>
                  {t("regularDrops.voteLockedNotice")}
                </ThemedText>
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && { backgroundColor: colors.accentHover },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.close")}
                >
                  <ThemedText style={styles.primaryButtonText}>{t("common.close")}</ThemedText>
                </Pressable>
              </View>
            ) : poll.hasVoted ? (
              <View style={{ gap: spacing[3] }}>
                <View style={styles.votedBanner}>
                  <View style={styles.successIconSmall}>
                    <Check size={14} color="rgb(90,210,140)" strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <ThemedText style={styles.votedTitle}>
                      {t("regularDrops.voteRegistered")}
                    </ThemedText>
                    {votedOption && (
                      <ThemedText style={styles.votedName}>
                        {t("regularDrops.youVotedFor")}{" "}
                        {pickLang(
                          {
                            sv: votedOption.nameSv,
                            en: votedOption.nameEn,
                            da: votedOption.nameDa,
                          },
                          language
                        )}
                      </ThemedText>
                    )}
                    <ThemedText style={styles.lockedNotice}>
                      {t("regularDrops.voteLockedNotice")}
                    </ThemedText>
                  </View>
                </View>
                {countdownText && (
                  <ThemedText style={styles.countdown}>{countdownText}</ThemedText>
                )}
                {options.map((option) => (
                  <DropOptionCard
                    key={option.id}
                    option={option}
                    selected={votedOption?.id === option.id}
                    selectable={false}
                    onPress={() => {}}
                  />
                ))}
              </View>
            ) : step === "confirm" && selectedOption ? (
              <View style={{ gap: spacing[3] }}>
                <ThemedText style={styles.confirmHeading}>
                  {t("regularDrops.confirmVote")}
                </ThemedText>
                <DropOptionCard
                  option={selectedOption}
                  selected
                  selectable={false}
                  onPress={() => {}}
                />
                <ThemedText style={styles.lockedNotice}>
                  {t("regularDrops.voteLockedNotice")}
                </ThemedText>
                {errorCode && (
                  <View style={styles.errorBox} accessibilityRole="alert">
                    <AlertCircle size={14} color={colors.error} strokeWidth={2} />
                    <ThemedText style={styles.errorText}>
                      {t(voteErrorI18nKey(errorCode))}
                    </ThemedText>
                  </View>
                )}
                <Pressable
                  onPress={handleConfirmVote}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && !busy && { backgroundColor: colors.accentHover },
                    busy && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={retryable ? t("regularDrops.retry") : t("regularDrops.vote")}
                  accessibilityState={{ disabled: busy, busy }}
                >
                  <ThemedText style={styles.primaryButtonText}>
                    {busy
                      ? t("regularDrops.voting")
                      : retryable
                        ? t("regularDrops.retry")
                        : t("regularDrops.vote")}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (busy) return;
                    // Back to the list — the local selection is kept.
                    setErrorCode(null);
                    setStep("list");
                  }}
                  disabled={busy}
                  style={[styles.secondaryButton, busy && { opacity: 0.4 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t("regularDrops.cancel")}
                  accessibilityState={{ disabled: busy }}
                >
                  <ThemedText style={styles.secondaryButtonText}>
                    {t("regularDrops.cancel")}
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: spacing[3] }}>
                {showPollTitle && <ThemedText style={styles.pollTitle}>{pollTitle}</ThemedText>}
                {countdownText && (
                  <ThemedText style={styles.countdown}>{countdownText}</ThemedText>
                )}
                {options.map((option) => (
                  <DropOptionCard
                    key={option.id}
                    option={option}
                    selected={selectedId === option.id}
                    selectable
                    onPress={() => setSelectedId((prev) => selectDropOption(prev, option.id))}
                  />
                ))}
                <Pressable
                  onPress={() => {
                    if (!canConfirmSelection(selectedId)) return;
                    setErrorCode(null);
                    setStep("confirm");
                  }}
                  disabled={!canConfirmSelection(selectedId)}
                  style={[
                    styles.primaryButton,
                    !canConfirmSelection(selectedId) && { opacity: 0.5 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t("regularDrops.vote")}
                  accessibilityState={{ disabled: !canConfirmSelection(selectedId) }}
                >
                  <ThemedText style={styles.primaryButtonText}>{t("regularDrops.vote")}</ThemedText>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DropOptionCard({
  option,
  selected,
  selectable,
  onPress,
}: {
  option: ApiRegularDropOption;
  selected: boolean;
  selectable: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [imageFailed, setImageFailed] = useState(false);

  const name = pickLang({ sv: option.nameSv, en: option.nameEn, da: option.nameDa }, language);
  const teaser = pickLang(
    { sv: option.teaserSv, en: option.teaserEn, da: option.teaserDa },
    language
  );
  const showImage = !imageFailed && !!option.imageUrl && option.imageUrl.trim().length > 0;

  const body = (
    <>
      {showImage ? (
        <Image
          source={{ uri: option.imageUrl as string }}
          style={styles.cardImage}
          contentFit="cover"
          transition={150}
          onError={() => setImageFailed(true)}
          accessible={false}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImageFallback]}>
          <ImageOff size={20} color={colors.textMuted} strokeWidth={1.6} />
          <ThemedText variant="caption" style={{ color: colors.textMuted }}>
            {t("regularDrops.imageUnavailable")}
          </ThemedText>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <ThemedText style={styles.cardName} numberOfLines={2}>
            {name}
          </ThemedText>
          {selected && <Check size={16} color={colors.accent} strokeWidth={2.4} />}
        </View>
        {teaser.length > 0 && (
          <ThemedText style={styles.cardTeaser} numberOfLines={2}>
            {teaser}
          </ThemedText>
        )}
      </View>
    </>
  );

  if (!selectable) {
    return (
      <View
        style={[styles.card, selected && styles.cardSelected]}
        accessibilityLabel={
          selected ? t("regularDrops.selectedAccessibilityLabel", { name }) : undefined
        }
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="radio"
      accessibilityLabel={t("regularDrops.optionAccessibilityLabel", { name, teaser })}
      accessibilityState={{ selected, checked: selected }}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "rgba(20,20,22,0.98)",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(232,101,10,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 18, paddingTop: spacing[2], paddingBottom: spacing[8] },

  pollTitle: { fontSize: 14, color: colors.textSecondary },
  countdown: { fontSize: 12, color: colors.textMuted },
  mutedCenter: { textAlign: "center", color: colors.textMuted, paddingVertical: spacing[6] },
  confirmHeading: {
    fontSize: 15,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
  },
  lockedNotice: { fontSize: 12, color: colors.textMuted },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  cardSelected: { borderColor: colors.accent },
  cardImage: { width: "100%", aspectRatio: IMAGE_ASPECT },
  cardImageFallback: {
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  cardBody: { padding: spacing[4], gap: spacing[1] },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  cardName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  cardTeaser: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },

  votedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(90,210,140,0.35)",
    borderRadius: radius.card,
    padding: spacing[4],
  },
  votedTitle: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  votedName: { fontSize: 13, color: colors.textSecondary },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
    backgroundColor: "rgba(248,113,113,0.08)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    borderRadius: 12,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  errorText: { flex: 1, minWidth: 0, fontSize: 13, color: colors.error },

  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[3],
  },
  primaryButtonText: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: "#FFFFFF" },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[3],
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },

  successIcon: {
    alignSelf: "center",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(90,210,140,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing[2],
  },
  successIconSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(90,210,140,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  successVotedFor: { textAlign: "center", fontSize: 14, color: colors.textSecondary },
  successVotedName: { fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  successThanks: { textAlign: "center", fontSize: 13, color: colors.textMuted },
});
