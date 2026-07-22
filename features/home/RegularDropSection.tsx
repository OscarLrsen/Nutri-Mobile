import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Check, ImageOff } from "lucide-react-native";
import type { TFunction } from "i18next";

import { Skeleton } from "@/components/feedback/Skeleton";
import { ThemedText } from "@/components/ui/ThemedText";
import { pickLang, useLanguage, useTranslation } from "@/i18n";
import {
  useActiveRegularDropQuery,
  type ApiRegularDropOption,
  type ApiRegularDropPoll,
} from "@/services/api/regularDrops";
import { colors, fontFamily, radius, spacing } from "@/theme";

import {
  getDropCountdown,
  getDropRefetchIntervalMs,
  sortDropOptions,
  type DropCountdown,
} from "./regularDropHelpers";

/**
 * "Rösta fram nästa Nutri Drop" — Home section for the active Regular Drop
 * poll. Self-contained like the other Home cards: owns its auth-gated
 * query, shows a skeleton only during initial load, and degrades silently
 * (renders nothing) on error/no poll so the dashboard is never blocked.
 *
 * Phase 6 scope: display + already-voted lock state only. Tapping "Rösta"
 * calls onSelectOption — phase 7 mounts the confirmation sheet behind that
 * callback; no POST happens here and nothing pretends a vote succeeded.
 * Results are never rendered (an active poll's result is always null —
 * product decision), and the client never derives its own numbers.
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

export function RegularDropSection({
  onSelectOption,
}: {
  /** Phase 7 opens the vote-confirmation sheet here. Never a vote itself. */
  onSelectOption: (option: ApiRegularDropOption) => void;
}) {
  const query = useActiveRegularDropQuery({
    refetchInterval: (data) => getDropRefetchIntervalMs(data, Date.now()),
  });

  // One minute-tick for the whole section (not per option card).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (query.isLoading) {
    // Roughly the finished section's shape; hidden from the a11y tree.
    return (
      <View
        style={styles.skeletonWrap}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Skeleton height={16} width={200} />
        <Skeleton height={180} />
        <Skeleton height={180} />
      </View>
    );
  }

  const poll = query.data?.poll;
  // Silent degradation: errors, no poll, or (phase 6) an ended poll.
  if (query.isError || !poll || !poll.isActive) return null;

  return <ActivePoll poll={poll} nowMs={nowMs} onSelectOption={onSelectOption} />;
}

function ActivePoll({
  poll,
  nowMs,
  onSelectOption,
}: {
  poll: ApiRegularDropPoll;
  nowMs: number;
  onSelectOption: (option: ApiRegularDropOption) => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();

  const options = sortDropOptions(poll.options);
  const countdown = getDropCountdown(poll.endsAt, nowMs);
  const countdownText = countdownLabel(countdown, t);

  const pollTitle = pickLang(
    { sv: poll.titleSv, en: poll.titleEn, da: poll.titleDa },
    language
  );
  // Skip the campaign intro when the admin named the poll the same thing as
  // the product headline — no doubled headings.
  const showPollTitle =
    pollTitle.trim().length > 0 &&
    pollTitle.trim().toLowerCase() !== t("regularDrops.title").trim().toLowerCase();

  const votedOption = poll.hasVoted
    ? (options.find((o) => o.id === poll.votedOptionId) ?? null)
    : null;
  if (poll.hasVoted && poll.votedOptionId && !votedOption && __DEV__) {
    console.warn("[RegularDropSection] votedOptionId matches no option — showing generic lock state");
  }

  return (
    <View style={styles.container}>
      <View accessibilityRole="header">
        <ThemedText style={styles.sectionLabel}>
          {t("regularDrops.sectionLabel").toUpperCase()}
        </ThemedText>
        <ThemedText style={styles.title}>{t("regularDrops.title")}</ThemedText>
      </View>
      {showPollTitle && <ThemedText style={styles.pollTitle}>{pollTitle}</ThemedText>}
      {countdownText && <ThemedText style={styles.countdown}>{countdownText}</ThemedText>}

      {poll.hasVoted && (
        <View style={styles.votedBanner}>
          <View style={styles.votedIconWrap}>
            <Check size={14} color="rgb(90,210,140)" strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <ThemedText style={styles.votedTitle}>{t("regularDrops.voteRegistered")}</ThemedText>
            {votedOption && (
              <ThemedText style={styles.votedName}>
                {t("regularDrops.youVotedFor")}{" "}
                {pickLang(
                  { sv: votedOption.nameSv, en: votedOption.nameEn, da: votedOption.nameDa },
                  language
                )}
              </ThemedText>
            )}
            <ThemedText style={styles.votedNotice}>
              {t("regularDrops.voteLockedNotice")}
            </ThemedText>
          </View>
        </View>
      )}

      {options.map((option) => (
        <OptionCard
          key={option.id}
          option={option}
          hasVoted={poll.hasVoted}
          isSelected={votedOption?.id === option.id}
          onSelect={() => onSelectOption(option)}
        />
      ))}
    </View>
  );
}

function OptionCard({
  option,
  hasVoted,
  isSelected,
  onSelect,
}: {
  option: ApiRegularDropOption;
  hasVoted: boolean;
  isSelected: boolean;
  onSelect: () => void;
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

  return (
    <View
      style={[styles.card, isSelected && styles.cardSelected]}
      accessibilityLabel={
        isSelected ? t("regularDrops.selectedAccessibilityLabel", { name }) : undefined
      }
    >
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
          <ImageOff size={22} color={colors.textMuted} strokeWidth={1.6} />
          <ThemedText variant="caption" style={styles.imageFallbackText}>
            {t("regularDrops.imageUnavailable")}
          </ThemedText>
        </View>
      )}

      <View style={styles.cardBody}>
        <View style={styles.nameRow}>
          <ThemedText style={styles.name} numberOfLines={2}>
            {name}
          </ThemedText>
          {isSelected && <Check size={16} color={colors.accent} strokeWidth={2.4} />}
        </View>
        {teaser.length > 0 && (
          <ThemedText style={styles.teaser} numberOfLines={2}>
            {teaser}
          </ThemedText>
        )}

        {!hasVoted && (
          <Pressable
            onPress={onSelect}
            style={({ pressed }) => [
              styles.voteButton,
              pressed && { backgroundColor: colors.accentHover },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("regularDrops.optionAccessibilityLabel", { name, teaser })}
          >
            <ThemedText style={styles.voteButtonText}>{t("regularDrops.vote")}</ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonWrap: { gap: spacing[3] },
  container: { gap: spacing[3] },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  title: {
    marginTop: 2,
    fontSize: 18,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  pollTitle: { fontSize: 14, color: colors.textSecondary },
  countdown: { fontSize: 12, color: colors.textMuted },

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
  votedIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(90,210,140,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  votedTitle: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  votedName: { fontSize: 13, color: colors.textSecondary },
  votedNotice: { fontSize: 12, color: colors.textMuted },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  cardSelected: { borderColor: colors.accentBorder },
  image: { width: "100%", aspectRatio: IMAGE_ASPECT },
  imageFallback: {
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  imageFallbackText: { color: colors.textMuted },
  cardBody: { padding: spacing[4], gap: spacing[2] },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  teaser: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  voteButton: {
    marginTop: spacing[2],
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[3],
  },
  voteButtonText: { fontSize: 14, fontFamily: fontFamily.bodyBold, color: "#FFFFFF" },
});
