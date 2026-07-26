import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Check, ImageOff, Trophy } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { pickLang, useLanguage, useTranslation } from "@/i18n";
import type { ApiRegularDropPoll } from "@/services/api/regularDrops";
import { colors, fontFamily, radius, spacing } from "@/theme";

import { buildDropResultView, clampPercentWidth, type DropResultRow } from "./regularDropResultHelpers";

/**
 * Final-results view for an ended, relevant Regular Drop (the user voted;
 * server shows it ≤7 days). Every number is the backend's: votes, integer
 * percent, totalVotes, winnerOptionIds and isTie are rendered verbatim —
 * the client computes nothing (the only arithmetic is the visual width
 * clamp in the helper). No vote actions exist here.
 */

const GREEN = "rgb(90,210,140)";

export function RegularDropResults({ poll }: { poll: ApiRegularDropPoll }) {
  const { t } = useTranslation();
  const { language } = useLanguage();

  const view = buildDropResultView(poll);
  if (!view) return null;
  if (view.anomalies.length > 0 && __DEV__) {
    console.warn("[RegularDropResults] contract anomalies:", view.anomalies.join("; "));
  }

  const pollTitle = pickLang({ sv: poll.titleSv, en: poll.titleEn, da: poll.titleDa }, language);
  const showPollTitle =
    pollTitle.trim().length > 0 &&
    pollTitle.trim().toLowerCase() !== t("regularDrops.title").trim().toLowerCase();

  const votedRow = view.rows.find((r) => r.isUsersChoice) ?? null;

  return (
    <View style={styles.container}>
      <View accessibilityRole="header">
        <ThemedText style={styles.sectionLabel}>
          {t("regularDrops.sectionLabel").toUpperCase()}
        </ThemedText>
        <View style={styles.titleRow}>
          <ThemedText style={styles.title}>{t("regularDrops.title")}</ThemedText>
          <View style={styles.endedPill}>
            <ThemedText style={styles.endedPillText}>{t("regularDrops.ended")}</ThemedText>
          </View>
        </View>
      </View>
      {showPollTitle && <ThemedText style={styles.pollTitle}>{pollTitle}</ThemedText>}

      <View style={styles.summaryRow}>
        <ThemedText style={styles.resultsLabel}>{t("regularDrops.results")}</ThemedText>
        <ThemedText style={styles.totalVotes}>
          {view.totalVotes === 0
            ? t("regularDrops.noVotesYet")
            : t("regularDrops.totalVotes", { count: view.totalVotes })}
        </ThemedText>
      </View>

      {view.totalVotes > 0 && view.isTie && (
        <View style={styles.tieBanner}>
          <Trophy size={14} color="#F4B860" strokeWidth={2} />
          <ThemedText style={styles.tieBannerText}>{t("regularDrops.tie")}</ThemedText>
        </View>
      )}

      {votedRow && (
        <ThemedText style={styles.youVoted}>
          {t("regularDrops.youVotedFor")}{" "}
          <ThemedText style={styles.youVotedName}>
            {pickLang(
              {
                sv: votedRow.option.nameSv,
                en: votedRow.option.nameEn,
                da: votedRow.option.nameDa,
              },
              language
            )}
          </ThemedText>
        </ThemedText>
      )}

      {view.rows.map((row) => (
        <ResultRowCard key={row.option.id} row={row} isTie={view.isTie} />
      ))}
    </View>
  );
}

function ResultRowCard({ row, isTie }: { row: DropResultRow; isTie: boolean }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [imageFailed, setImageFailed] = useState(false);

  const { option } = row;
  const name = pickLang({ sv: option.nameSv, en: option.nameEn, da: option.nameDa }, language);
  const showImage = !imageFailed && !!option.imageUrl && option.imageUrl.trim().length > 0;
  const widthPct = clampPercentWidth(row.percent);

  const winnerLabel = row.isWinner
    ? isTie
      ? t("regularDrops.sharedWinner")
      : t("regularDrops.winner")
    : null;

  const a11yParts = [name];
  if (row.votes !== null) a11yParts.push(t("regularDrops.votes", { count: row.votes }));
  if (row.percent !== null) a11yParts.push(`${row.percent} %`);
  if (winnerLabel) a11yParts.push(winnerLabel);
  if (row.isUsersChoice) a11yParts.push(t("regularDrops.yourChoice"));

  return (
    <View
      style={[styles.card, row.isWinner && styles.cardWinner]}
      accessible
      accessibilityLabel={a11yParts.join(", ")}
    >
      <View style={styles.cardTop}>
        {showImage ? (
          <Image
            source={{ uri: option.imageUrl as string }}
            style={styles.thumb}
            contentFit="cover"
            transition={150}
            accessible={false}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <ImageOff size={16} color={colors.textMuted} strokeWidth={1.6} />
          </View>
        )}

        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <ThemedText style={styles.name} numberOfLines={2}>
              {name}
            </ThemedText>
          </View>
          <View style={styles.chipRow}>
            {winnerLabel && (
              <View style={styles.winnerChip}>
                <Trophy size={10} color={GREEN} strokeWidth={2.2} />
                <ThemedText style={styles.winnerChipText}>{winnerLabel}</ThemedText>
              </View>
            )}
            {row.isUsersChoice && (
              <View style={styles.choiceChip}>
                <Check size={10} color={colors.accent} strokeWidth={2.4} />
                <ThemedText style={styles.choiceChipText}>
                  {t("regularDrops.yourChoice")}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        <ThemedText style={styles.numbers}>
          {row.votes !== null && row.percent !== null
            ? `${t("regularDrops.votes", { count: row.votes })} · ${row.percent} %`
            : "–"}
        </ThemedText>
      </View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: widthPct }}
      >
        <View
          style={[
            styles.fill,
            { width: `${widthPct}%` },
            row.isWinner && { backgroundColor: GREEN },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing[3] },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  titleRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    flexWrap: "wrap",
  },
  title: {
    fontSize: 18,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  endedPill: {
    borderRadius: 999,
    backgroundColor: "rgba(248,113,113,0.12)",
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  endedPillText: { fontSize: 10, fontFamily: fontFamily.bodySemibold, color: "#f87171" },
  pollTitle: { fontSize: 14, color: colors.textSecondary },

  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
    flexWrap: "wrap",
  },
  resultsLabel: { fontSize: 13, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  totalVotes: { fontSize: 12, color: colors.textMuted },

  tieBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: "rgba(244,184,96,0.10)",
    borderWidth: 1,
    borderColor: "rgba(244,184,96,0.3)",
    borderRadius: 12,
    padding: spacing[3],
  },
  tieBannerText: { flex: 1, minWidth: 0, fontSize: 13, color: "#F4B860" },

  youVoted: { fontSize: 13, color: colors.textSecondary },
  youVotedName: { fontFamily: fontFamily.bodyBold, color: colors.textPrimary },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing[3],
    gap: spacing[2],
  },
  cardWinner: { borderColor: "rgba(90,210,140,0.4)" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  thumb: { width: 66, height: 44, borderRadius: 8 },
  thumbFallback: {
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1, minWidth: 0, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: -0.1,
    color: colors.textPrimary,
  },
  chipRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], flexWrap: "wrap" },
  winnerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "rgba(90,210,140,0.12)",
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  winnerChipText: { fontSize: 10, fontFamily: fontFamily.bodySemibold, color: GREEN },
  choiceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "rgba(232,101,10,0.12)",
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  choiceChipText: { fontSize: 10, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  numbers: { fontSize: 12, color: colors.textMuted, textAlign: "right" },

  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cardAlt,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.accent },
});
