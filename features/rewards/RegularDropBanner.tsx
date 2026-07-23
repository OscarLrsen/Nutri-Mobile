import { Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronRight, Circle, Vote } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { pickLang, useLanguage, useTranslation } from "@/i18n";
import type { ApiRegularDropPoll } from "@/services/api/regularDrops";
import { sortDropOptions } from "@/features/home/regularDropHelpers";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Compact Regular Drop banner — "this week's question" — rendered directly
 * under the rewards hero, above the weekly-reward content. Presentation
 * only: the whole banner is one pressable that opens the existing
 * RegularDropSheet (same data, same query cache, no extra fetch, no vote
 * logic here). Hidden entirely by the caller when no relevant poll exists.
 */
export function RegularDropBanner({
  poll,
  onPress,
}: {
  poll: ApiRegularDropPoll;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();

  const options = sortDropOptions(poll.options);
  const ended = poll.isEnded;
  const subtitle = ended ? t("regularDrops.viewResults") : t("regularDrops.bannerSubtitle");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && { backgroundColor: colors.cardAlt }]}
      accessibilityRole="button"
      accessibilityLabel={t("regularDrops.bannerTitle")}
      accessibilityHint={subtitle}
    >
      <View style={styles.headRow}>
        <View style={styles.iconWrap}>
          <Vote size={13} color={colors.accent} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {t("regularDrops.bannerTitle")}
          </ThemedText>
          <ThemedText style={[styles.subtitle, ended && styles.subtitleAccent]} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        </View>
        <ChevronRight size={15} color="rgba(255,255,255,0.4)" strokeWidth={2} />
      </View>

      <View style={styles.optionRow}>
        {options.map((option) => {
          const chosen = poll.hasVoted && poll.votedOptionId === option.id;
          const name = pickLang(
            { sv: option.nameSv, en: option.nameEn, da: option.nameDa },
            language
          );
          return (
            <View key={option.id} style={styles.option}>
              {chosen ? (
                <Check size={11} color={colors.accent} strokeWidth={2.6} />
              ) : (
                <Circle size={9} color={colors.textMuted} strokeWidth={1.8} />
              )}
              <ThemedText
                style={[styles.optionText, chosen && styles.optionTextChosen]}
                numberOfLines={1}
              >
                {name}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: -0.1,
    color: colors.textPrimary,
  },
  subtitle: { fontSize: 12, color: colors.textMuted },
  subtitleAccent: { color: colors.accent },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing[4],
    rowGap: 4,
    paddingLeft: 26 + spacing[3],
  },
  option: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  optionText: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  optionTextChosen: { color: colors.accent, fontFamily: fontFamily.bodySemibold },
});
