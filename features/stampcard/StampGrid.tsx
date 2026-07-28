import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";

import { colors, spacing } from "@/theme";
import { useTranslation } from "@/i18n";

/**
 * The ten-stamp card itself.
 *
 * Laid out as two rows of five rather than one row of ten: at ten across, a
 * stamp on a small iPhone drops to roughly 22pt, which is both hard to read
 * and below a comfortable target. Two rows keep every stamp legible at any
 * width and never scroll horizontally.
 *
 * Filled state is carried by THREE signals — fill, border and a checkmark —
 * so the card is readable without colour vision, and each stamp exposes its
 * own label ("Stamp 6 of 10, earned"). The group itself carries a spoken
 * summary so a screen reader user gets the progress in one sentence instead
 * of ten fragments.
 */

const STAMP_COUNT = 10;
const ROW_SIZE = 5;

export function StampGrid({
  filled,
  total = STAMP_COUNT,
  size = "regular",
  animate = false,
}: {
  filled: number;
  total?: number;
  size?: "regular" | "large";
  animate?: boolean;
}) {
  const { t } = useTranslation();
  const safeFilled = Math.max(0, Math.min(filled, total));
  const remaining = total - safeFilled;

  const rows: number[][] = [];
  for (let i = 0; i < total; i += ROW_SIZE) {
    rows.push(Array.from({ length: Math.min(ROW_SIZE, total - i) }, (_, j) => i + j));
  }

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("stampCard.gridAria", { filled: safeFilled, total, remaining })}
      accessibilityValue={{ min: 0, max: total, now: safeFilled }}
      style={styles.grid}
    >
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((index) => (
            <Stamp
              key={index}
              index={index}
              isFilled={index < safeFilled}
              total={total}
              size={size}
              animate={animate}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function Stamp({
  index,
  isFilled,
  total,
  size,
  animate,
}: {
  index: number;
  isFilled: boolean;
  total: number;
  size: "regular" | "large";
  animate: boolean;
}) {
  const { t } = useTranslation();
  const dimension = size === "large" ? 46 : 30;
  const iconSize = size === "large" ? 20 : 14;

  // Entry animation runs once per mount, staggered across the row. Held in a
  // ref so a re-render (a refetch landing, a language change) never replays
  // it, and it starts at its final value when animation is off so a stamp is
  // never drawn in a state the server has not confirmed.
  const progress = useRef(new Animated.Value(animate && isFilled ? 0 : 1)).current;
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!animate || !isFilled || hasAnimated.current) return;
    hasAnimated.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: index * 45,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [animate, isFilled, index, progress]);

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        isFilled
          ? t("stampCard.stampEarnedAria", { index: index + 1, total })
          : t("stampCard.stampEmptyAria", { index: index + 1, total })
      }
      style={[
        styles.stamp,
        { width: dimension, height: dimension, borderRadius: dimension / 2 },
        isFilled ? styles.stampFilled : styles.stampEmpty,
        {
          opacity: progress,
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
        },
      ]}
    >
      {isFilled ? <Check size={iconSize} color={colors.bg} strokeWidth={3} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing[2] },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing[2] },
  stamp: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  stampFilled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  // A visible ring, not a barely-there ghost: an empty stamp has to read as
  // "not yet earned", not as a rendering artefact.
  stampEmpty: {
    backgroundColor: colors.cardAlt,
    borderColor: "rgba(255,255,255,0.16)",
    borderStyle: "dashed",
  },
});
