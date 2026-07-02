import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { UtensilsCrossed } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiMeal, ApiMealAvailability } from "@/services/api/meals";
import { CUSTOMER_SIZE_OPTIONS, previewMealPriceOre } from "@/utils/pricing";
import { formatPriceKr } from "@/utils/money";
import { menuCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Meal card — mobile port of the web /meny page's MealCard. Logic (per-size
 * stock, fixed-portion handling, auto-shift off a sold-out size, macro/price
 * scaling) is ported 1:1; layout is adapted for a native card list.
 *
 * Mirrors the web POS/dashboard low-stock threshold.
 */
const LOW_STOCK_THRESHOLD = 3;

interface MealCardProps {
  meal: ApiMeal;
  /** null = availability unknown (endpoint failed/loading) → treat every
   * size as available; backend stock validation at order time is the safety
   * net. Same fallback contract as the web. */
  availability: ApiMealAvailability | null;
}

export function MealCard({ meal, availability }: MealCardProps) {
  const isFixed = meal.portionMode === "fixed";
  const [selectedSize, setSelectedSize] = useState<string>("medium");
  const [imageFailed, setImageFailed] = useState(false);

  const stockBySize = useMemo(() => {
    const info = (id: "small" | "medium" | "large") => {
      if (!availability) return { soldOut: false, count: null as number | null };
      const sa = availability[id];
      return { soldOut: sa.soldOut === true, count: sa.count ?? null };
    };
    return { small: info("small"), medium: info("medium"), large: info("large") };
  }, [availability]);

  // Fixed-portion meals: sold-out is based solely on medium stock (web parity).
  const allSoldOut = isFixed
    ? Boolean(availability) && stockBySize.medium.soldOut
    : Boolean(availability) && stockBySize.medium.soldOut && stockBySize.large.soldOut;

  // Auto-shift selection off a size that has just gone sold-out (sizes mode only).
  useEffect(() => {
    if (isFixed || !availability) return;
    if (!stockBySize[selectedSize as "medium" | "large"].soldOut) return;
    const fallback = CUSTOMER_SIZE_OPTIONS.find(
      (s) => !stockBySize[s.id as "medium" | "large"].soldOut
    );
    if (fallback) setSelectedSize(fallback.id);
  }, [availability, selectedSize, isFixed, stockBySize]);

  const effectiveSize = isFixed ? "medium" : selectedSize;
  const size = CUSTOMER_SIZE_OPTIONS.find((s) => s.id === effectiveSize) ?? CUSTOMER_SIZE_OPTIONS[0];
  const calories = Math.round(meal.macros.calories * size.macroMultiplier);
  const proteinG = Math.round(meal.macros.proteinG * size.macroMultiplier);
  const priceOre = previewMealPriceOre(meal.basePrice, size.priceMultiplier);

  const selected = stockBySize[effectiveSize as "medium" | "large"];
  const showLowStock =
    !selected.soldOut &&
    selected.count !== null &&
    selected.count > 0 &&
    selected.count <= LOW_STOCK_THRESHOLD;

  const showImage = !imageFailed && meal.image.trim().length > 0;

  return (
    <View style={styles.card}>
      {/* Image */}
      <View style={styles.imageWrap}>
        {showImage ? (
          <Image
            source={{ uri: meal.image }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            onError={() => setImageFailed(true)}
            accessibilityLabel={meal.name}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <UtensilsCrossed size={28} color="rgba(255,255,255,0.2)" />
          </View>
        )}
        {meal.badgeText ? (
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>{meal.badgeText.toUpperCase()}</ThemedText>
          </View>
        ) : null}
      </View>

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText variant="bodyMedium" style={styles.title} numberOfLines={2}>
            {meal.name}
          </ThemedText>
          <ThemedText style={styles.price}>{formatPriceKr(priceOre)}</ThemedText>
        </View>

        {meal.description ? (
          <ThemedText variant="caption" color="textTertiary" numberOfLines={1}>
            {meal.description}
          </ThemedText>
        ) : null}

        {/* Compact nutrition row: kcal · protein */}
        <View style={styles.macroRow}>
          <ThemedText style={styles.macroText}>{calories} kcal</ThemedText>
          <ThemedText style={styles.macroDot}>·</ThemedText>
          <ThemedText style={[styles.macroText, styles.macroAccent]}>{proteinG}g protein</ThemedText>
        </View>

        {/* Stock badges */}
        {(allSoldOut || showLowStock) && (
          <View style={styles.stockRow}>
            {allSoldOut ? (
              <View style={[styles.stockPill, styles.soldOutPill]}>
                <ThemedText style={styles.soldOutText}>
                  {menuCopy.soldOutToday.toUpperCase()}
                </ThemedText>
              </View>
            ) : showLowStock && selected.count !== null ? (
              <View style={[styles.stockPill, styles.lowStockPill]}>
                <ThemedText style={styles.lowStockText}>
                  {menuCopy.stockLeft(selected.count).toUpperCase()}
                </ThemedText>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Footer: size selector (M/L) — small is customer-hidden, web parity */}
      {!isFixed && (
        <View style={styles.footer}>
          <View style={styles.sizeGroup}>
            {CUSTOMER_SIZE_OPTIONS.map((s) => {
              const isSelected = selectedSize === s.id;
              const sSoldOut = stockBySize[s.id as "medium" | "large"].soldOut;
              return (
                <Pressable
                  key={s.id}
                  disabled={sSoldOut}
                  onPress={() => setSelectedSize(s.id)}
                  style={[styles.sizeButton, isSelected && !sSoldOut && styles.sizeButtonSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: sSoldOut }}
                  accessibilityLabel={sSoldOut ? menuCopy.sizeSoldOut(s.label) : s.label}
                >
                  <ThemedText
                    style={[
                      styles.sizeLabel,
                      isSelected && !sSoldOut && styles.sizeLabelSelected,
                      sSoldOut && styles.sizeLabelSoldOut,
                    ]}
                  >
                    {s.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  imageWrap: {
    height: 150,
    backgroundColor: colors.cardAlt,
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    left: spacing[3],
    top: spacing[3],
    backgroundColor: "rgba(232,101,10,0.92)",
    borderRadius: radius.chip,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.2,
    color: colors.textPrimary,
  },
  body: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[1],
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing[2],
  },
  title: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
  },
  price: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 16,
    color: colors.textPrimary,
  },
  macroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  macroText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  macroDot: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
  },
  macroAccent: {
    color: colors.accent,
  },
  stockRow: {
    flexDirection: "row",
    marginTop: spacing[1],
  },
  stockPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  soldOutPill: {
    backgroundColor: "rgba(232,80,80,0.14)",
    borderColor: "rgba(232,80,80,0.28)",
  },
  soldOutText: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.6,
    color: "#ff8585",
  },
  lowStockPill: {
    backgroundColor: "rgba(232,160,40,0.12)",
    borderColor: "rgba(232,160,40,0.28)",
  },
  lowStockText: {
    fontSize: 10,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 0.6,
    color: "#ffb759",
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  sizeGroup: {
    flexDirection: "row",
    gap: spacing[1],
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 3,
  },
  sizeButton: {
    height: 28,
    width: 34,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeButtonSelected: {
    backgroundColor: colors.accent,
  },
  sizeLabel: {
    fontSize: 12,
    fontFamily: fontFamily.bodySemibold,
    color: "rgba(255,255,255,0.45)",
  },
  sizeLabelSelected: {
    color: colors.textPrimary,
  },
  sizeLabelSoldOut: {
    color: "rgba(255,255,255,0.22)",
    textDecorationLine: "line-through",
  },
});
