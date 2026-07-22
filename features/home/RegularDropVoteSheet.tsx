import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { AlertCircle, Check, ImageOff, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { pickLang, useLanguage, useTranslation } from "@/i18n";
import {
  useRegularDropVote,
  type ApiRegularDropOption,
  type ApiRegularDropPoll,
} from "@/services/api/regularDrops";
import { parseRegularDropError, type RegularDropApiErrorCode } from "@/utils/regularDropErrors";
import { colors, fontFamily, radius, spacing } from "@/theme";

import {
  isRetryableVoteError,
  isStaleDataVoteError,
  resolveVotedOption,
  voteErrorI18nKey,
} from "./regularDropVoteHelpers";

/**
 * Vote-confirmation bottom sheet (LanguagePickerSheet pattern). Mounted by
 * HomeScreen only while an option is selected, so every opening starts
 * fresh in the confirmation state.
 *
 * The vote fires only on explicit confirm — no optimistic UI; the server
 * response (already written to the query cache by useRegularDropVote) is
 * the sole truth, including the ORIGINAL vote on duplicate/two-device
 * races. While the POST is in flight every dismissal path (backdrop, X,
 * cancel, Android back) is locked, and a ref guards double-taps faster
 * than a state render. Stale-data errors close the sheet via onPollStale
 * so Home refetches — the poll is never faked to null locally.
 */

const IMAGE_ASPECT = 3 / 2;

export function RegularDropVoteSheet({
  poll,
  option,
  onClose,
  onPollStale,
}: {
  poll: ApiRegularDropPoll;
  option: ApiRegularDropOption;
  /** Plain close (cancel / after success). */
  onClose: () => void;
  /** Close + the caller must refetch the active poll (stale server data). */
  onPollStale: () => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const vote = useRegularDropVote();

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"confirm" | "success">("confirm");
  const [errorCode, setErrorCode] = useState<RegularDropApiErrorCode | null>(null);
  const [votedName, setVotedName] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  // Closes the "second tap before React re-rendered" window (spin pattern).
  const lockRef = useRef(false);

  const name = pickLang({ sv: option.nameSv, en: option.nameEn, da: option.nameDa }, language);
  const teaser = pickLang(
    { sv: option.teaserSv, en: option.teaserEn, da: option.teaserDa },
    language
  );
  const showImage = !imageFailed && !!option.imageUrl && option.imageUrl.trim().length > 0;

  const handleConfirm = async () => {
    if (lockRef.current || busy) return;
    lockRef.current = true;
    setBusy(true);
    setErrorCode(null);
    try {
      const response = await vote(poll.id, option.id);
      // Server truth — may be the original vote from another device.
      const serverOption = resolveVotedOption(response);
      setVotedName(
        serverOption
          ? pickLang(
              { sv: serverOption.nameSv, en: serverOption.nameEn, da: serverOption.nameDa },
              language
            )
          : null
      );
      setPhase("success");
    } catch (err) {
      const parsed = parseRegularDropError(err);
      if (parsed.code === "pollNotActive") {
        // Poll closed under us — hand over to Home for refetch; no success,
        // no lingering sheet above a non-active poll.
        onPollStale();
        return;
      }
      setErrorCode(parsed.code);
    } finally {
      setBusy(false);
      lockRef.current = false;
    }
  };

  const handleDismiss = () => {
    if (busy) return;
    // After a stale-data error the caller must refetch before reusing the
    // selected option; a plain close suffices otherwise.
    if (errorCode && isStaleDataVoteError(errorCode)) onPollStale();
    else onClose();
  };

  const retryable = errorCode !== null && isRetryableVoteError(errorCode);
  const permanentError = errorCode !== null && !retryable;

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
              {phase === "success"
                ? t("regularDrops.voteRegistered")
                : t("regularDrops.confirmVote")}
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

          {phase === "confirm" ? (
            <View style={styles.content}>
              {/* The chosen option — unmistakable. */}
              <View style={styles.optionCard}>
                {showImage ? (
                  <Image
                    source={{ uri: option.imageUrl as string }}
                    style={styles.image}
                    contentFit="cover"
                    transition={150}
                    onError={() => setImageFailed(true)}
                    accessible={false}
                  />
                ) : (
                  <View style={[styles.image, styles.imageFallback]}>
                    <ImageOff size={20} color={colors.textMuted} strokeWidth={1.6} />
                    <ThemedText variant="caption" style={{ color: colors.textMuted }}>
                      {t("regularDrops.imageUnavailable")}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.optionBody}>
                  <ThemedText style={styles.optionName} numberOfLines={2}>
                    {name}
                  </ThemedText>
                  {teaser.length > 0 && (
                    <ThemedText style={styles.optionTeaser} numberOfLines={2}>
                      {teaser}
                    </ThemedText>
                  )}
                </View>
              </View>

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

              {!permanentError ? (
                <>
                  <Pressable
                    onPress={handleConfirm}
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
                    onPress={handleDismiss}
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
                </>
              ) : (
                <Pressable
                  onPress={handleDismiss}
                  style={styles.secondaryButton}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.close")}
                >
                  <ThemedText style={styles.secondaryButtonText}>{t("common.close")}</ThemedText>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.content} accessibilityLiveRegion="polite">
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
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "rgba(20,20,22,0.98)",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    paddingBottom: spacing[8],
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
  content: { paddingHorizontal: 18, paddingTop: spacing[2], gap: spacing[3] },

  optionCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  image: { width: "100%", aspectRatio: IMAGE_ASPECT },
  imageFallback: {
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  optionBody: { padding: spacing[4], gap: 4 },
  optionName: {
    fontSize: 16,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  optionTeaser: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },

  lockedNotice: { fontSize: 12, color: colors.textMuted },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
    backgroundColor: "rgba(248,113,113,0.08)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    borderRadius: 12,
    padding: spacing[3],
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
  successVotedFor: { textAlign: "center", fontSize: 14, color: colors.textSecondary },
  successVotedName: { fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  successThanks: { textAlign: "center", fontSize: 13, color: colors.textMuted },
});
