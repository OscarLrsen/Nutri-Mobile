import { useState } from "react";
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { NutritionRings } from "./NutritionRingStack";
import {
  buildNutrientRings,
  formatRingValue,
  overallProgressPercent,
  type NutrientKey,
  type NutrientRing,
} from "./nutritionRings";
import type { MacroTargetDto } from "@/services/api/nutrition";

/**
 * The compact ring indicator for the TODAY card, plus the detail popup it
 * opens.
 *
 * READ-ONLY, and it fetches nothing. The two values are passed in from
 * TodayCard, which already has them — so this cannot drift from the numbers
 * printed next to it, and it adds no request. When Home refetches, the card
 * re-renders and the rings follow.
 *
 * The popup is a CENTRED modal, not a bottom sheet: Pontus asked for a
 * popup, and building a fake swipe-down affordance on something that does
 * not come from the bottom would be a lie about how it behaves. It closes
 * on the X and on the backdrop, which is this app's centred-modal pattern.
 */
export function NutritionRingsCard({
  target,
  consumed,
}: {
  target: MacroTargetDto | null | undefined;
  consumed: MacroTargetDto | null | undefined;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rings = buildNutrientRings(target, consumed);
  const percent = overallProgressPercent(rings);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.compact, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityLabel={t("home.ringsAria", { percent })}
        accessibilityHint={t("home.ringsHint")}
      >
        <NutritionRings rings={rings} size={54} strokeWidth={4} gap={1.5} />
      </Pressable>

      {open && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <View style={styles.backdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            />
            <NutritionDetail rings={rings} onClose={() => setOpen(false)} />
          </View>
        </Modal>
      )}
    </>
  );
}

/** Literal t() keys per nutrient — the i18n types only accept known keys,
 *  so the mapping lives here rather than as a string on the ring model. */
function NutrientLabel({ nutrient }: { nutrient: NutrientKey }) {
  const { t } = useTranslation();
  switch (nutrient) {
    case "calories":
      return <>{t("home.macroCalories")}</>;
    case "carbs":
      return <>{t("home.macroCarbs")}</>;
    case "protein":
      return <>{t("home.macroProtein")}</>;
    case "fat":
      return <>{t("home.macroFat")}</>;
    case "fiber":
      return <>{t("home.macroFiber")}</>;
  }
}

function NutritionDetail({ rings, onClose }: { rings: NutrientRing[]; onClose: () => void }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  // Side by side when there is room for both; stacked on a narrow phone so
  // nothing is clipped and the popup still fits without scrolling.
  const sideBySide = width >= 380;
  const circleSize = sideBySide ? 168 : 150;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText style={styles.cardTitle}>{t("home.ringsTitle")}</ThemedText>
        <Pressable
          onPress={onClose}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <X size={15} color={colors.accent} />
        </Pressable>
      </View>

      <View style={[styles.body, sideBySide ? styles.bodyRow : styles.bodyColumn]}>
        <View style={styles.circleWrap}>
          <NutritionRings rings={rings} size={circleSize} strokeWidth={11} gap={3.5} />
        </View>

        <View style={styles.legend}>
          {rings.map((ring) => (
            <View key={ring.key} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: ring.color }]} />
              <ThemedText style={styles.legendLabel} numberOfLines={1}>
                <NutrientLabel nutrient={ring.key} />
              </ThemedText>
              {/* The real numbers — deliberately NOT clamped like the arc,
                  so going over the goal is visible here even though a ring
                  cannot draw past full. */}
              <ThemedText style={styles.legendValue}>{formatRingValue(ring)}</ThemedText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { alignItems: "center", justifyContent: "center" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[5],
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing[5],
    paddingBottom: spacing[4],
  },
  cardTitle: { fontSize: 16, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { gap: spacing[5] },
  bodyRow: { flexDirection: "row", alignItems: "center" },
  bodyColumn: { flexDirection: "column", alignItems: "center" },
  circleWrap: { alignItems: "center", justifyContent: "center" },
  legend: { flex: 1, minWidth: 0, gap: spacing[3], width: "100%" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  legendLabel: { flex: 1, minWidth: 0, fontSize: 13, color: colors.textSecondary },
  legendValue: {
    fontSize: 13,
    fontFamily: fontFamily.monoMedium,
    color: colors.textPrimary,
  },
});
