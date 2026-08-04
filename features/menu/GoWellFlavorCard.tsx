import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Check } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiDrink } from "@/services/api/drinks";
import { formatPriceKr } from "@/utils/money";
import { useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

import { getGoWellVisual, goWellFlavorLabel, isDrinkInStock } from "./goWellFlavors";

/**
 * One GoWell flavour, in the locked design: a compact premium card with the
 * product image at its centre, a soft flavour wash behind it, and the price
 * or inclusion state underneath. No full-card gradient.
 *
 * Selection is never carried by colour alone — a selected card gets an orange
 * border, a check icon AND the word "Vald", and a sold-out one says "Slut
 * idag" rather than merely dimming.
 *
 * The card knows nothing about windows or carts. It renders the mode it is
 * given, which is what lets the menu and the cart share it.
 */
export type GoWellCardMode = "paid" | "included";

export function GoWellFlavorCard({
  drink,
  mode,
  selected = false,
  width,
  onPress,
}: {
  drink: ApiDrink;
  /** "paid" shows the price, "included" shows that it costs nothing. */
  mode: GoWellCardMode;
  selected?: boolean;
  /** Fixed width for the two-up grid; omitted lets the card fill its parent. */
  width?: number;
  onPress: (drink: ApiDrink) => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const visual = getGoWellVisual(drink);
  const inStock = isDrinkInStock(drink);
  const label = goWellFlavorLabel(drink, language);

  const stateLabel = !inStock
    ? t("goWell.soldOut")
    : selected
      ? t("goWell.selected")
      : mode === "included"
        ? t("goWell.includedFree")
        : formatPriceKr(drink.priceOre, language);

  return (
    <Pressable
      onPress={() => inStock && onPress(drink)}
      disabled={!inStock}
      style={({ pressed }) => [
        styles.card,
        width !== undefined && { width },
        selected && { borderColor: visual.accent, borderWidth: 2 },
        !inStock && styles.cardSoldOut,
        pressed && inStock && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !inStock }}
      accessibilityLabel={`${label}. ${stateLabel}`}
    >
      {/* Release P9: the transparent bottle floats straight on the card —
          the inner tinted box made it read as "ruta i ruta i ruta". The
          flavour accent survives in the name and the selection border. */}
      <View style={styles.imageWrap}>
        <Image
          source={drink.image || undefined}
          style={styles.image}
          contentFit="contain"
          accessibilityLabel={label}
          transition={120}
        />
      </View>

      <View style={styles.copy}>
        <ThemedText numberOfLines={2} style={[styles.name, { color: visual.accent }]}>
          {label}
        </ThemedText>

        {!inStock ? (
          <ThemedText style={styles.soldOutText}>{t("goWell.soldOut")}</ThemedText>
        ) : selected ? (
          <View style={styles.selectedRow}>
            <Check size={13} color={visual.accent} strokeWidth={3} />
            <ThemedText style={[styles.selectedText, { color: visual.accent }]}>
              {t("goWell.selected")}
            </ThemedText>
          </View>
        ) : (
          <ThemedText style={styles.price}>
            {mode === "included"
              ? t("goWell.includedFree")
              : formatPriceKr(drink.priceOre, language)}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[3],
    gap: spacing[2],
    // Comfortably above the 44pt minimum target on its own.
    minHeight: 198,
  },
  cardSoldOut: { opacity: 0.45 },
  // Release P9: GoWell gets the visual priority — a taller, airier stage
  // with NO background box behind the transparent bottle render.
  imageWrap: {
    height: 132,
    alignItems: "center",
    justifyContent: "center",
  },
  // contain, never cover: a bottle must not be cropped to fill the box.
  image: { width: "86%", height: "94%" },
  copy: { gap: 2, paddingHorizontal: 2, paddingBottom: 2 },
  name: { fontSize: 13, fontFamily: fontFamily.headlineSemibold, lineHeight: 17 },
  price: { fontSize: 12.5, color: colors.textSecondary },
  soldOutText: { fontSize: 12.5, color: colors.textTertiary },
  selectedRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  selectedText: { fontSize: 12.5, fontFamily: fontFamily.headlineSemibold },
});
