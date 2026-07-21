import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Shared premium plan card for the menu's two main-meal entry points
 * (Heldagsmåltid + Nutri anpassar). One component so the pair is guaranteed
 * to share size, padding, badge, heading level, CTA treatment and the dark
 * premium palette — the two read as equally primary. Palette is the web
 * FullDayMeal card's own warm-dark colours (#1A1410 / #2A1F14 / #C9BFB5 /
 * #8A7F76), deliberately literal (not theme tokens), matching the source.
 *
 * Purely presentational: each caller owns its own route/auth logic and passes
 * it in via `onPress`. `flex: 1` + a flex spacer keep both cards equal width
 * and bottom-align the CTA, so they stay the same height regardless of how
 * much text each one carries.
 */
export interface MenuPlanCardProps {
  badge: string;
  heading: string;
  subheading: string;
  ctaLabel: string;
  onPress: () => void;
  accessibilityLabel: string;
  /** Optional logged-out hint (Heldagsmåltid gates on login). */
  lockLabel?: string;
}

export function MenuPlanCard({
  badge,
  heading,
  subheading,
  ctaLabel,
  onPress,
  accessibilityLabel,
  lockLabel,
}: MenuPlanCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.glow} pointerEvents="none" />

      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <ThemedText
            style={styles.badgeText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            maxFontSizeMultiplier={1.25}
          >
            {badge}
          </ThemedText>
        </View>
      </View>

      <ThemedText
        style={styles.heading}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        maxFontSizeMultiplier={1.25}
      >
        {heading}
      </ThemedText>
      <ThemedText style={styles.subheading} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {subheading}
      </ThemedText>

      {lockLabel ? (
        <ThemedText style={styles.lock} numberOfLines={1} maxFontSizeMultiplier={1.25}>
          🔒 {lockLabel}
        </ThemedText>
      ) : null}

      {/* Pushes the CTA to the bottom so both cards align it at the same
          baseline even when their text lengths differ. */}
      <View style={styles.spacer} />

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <ThemedText
          style={styles.ctaText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.25}
        >
          {ctaLabel}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: "hidden",
    borderRadius: 16,
    padding: spacing[4],
    minHeight: 178,
    backgroundColor: "#1A1410",
    borderWidth: 1,
    borderColor: "#2A1F14",
  },
  glow: {
    position: "absolute",
    top: -34,
    right: -34,
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "rgba(232,101,10,0.10)",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing[3],
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.accent,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#FFFFFF",
  },
  heading: {
    fontSize: 17,
    fontFamily: fontFamily.bodyBold,
    textTransform: "uppercase",
    letterSpacing: -0.2,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  subheading: {
    fontSize: 12.5,
    lineHeight: 17,
    color: "#8A7F76",
  },
  lock: {
    marginTop: spacing[2],
    fontSize: 10.5,
    fontFamily: fontFamily.bodySemibold,
    color: "#888888",
  },
  spacer: {
    flex: 1,
    minHeight: spacing[4],
  },
  cta: {
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  ctaText: {
    fontSize: 13.5,
    fontFamily: fontFamily.bodyBold,
    color: "#FFFFFF",
  },
});
