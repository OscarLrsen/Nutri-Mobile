import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { CupSoda } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiDrink } from "@/services/api/drinks";
import { menuCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Drink card — mobile port of the web /meny DrinkCard's always-visible
 * metadata row. The admin-controlled show* flags gate every nutrition field
 * exactly as on the web (same defaults as the backend DTO): showNutrition
 * gates the whole group; calories shows even when 0 (e.g. NOCCO); the
 * gram/mg fields additionally require a value > 0.
 *
 * The web card's expandable detail grid is intentionally not ported —
 * mobile cards stay single-state until the (missing) Fable design source
 * says otherwise. Preliminary design decision.
 */
export function DrinkCard({ drink }: { drink: ApiDrink }) {
  const [imageFailed, setImageFailed] = useState(false);
  const priceKr = Math.round(drink.priceOre / 100);
  const showImage = !imageFailed && drink.image.trim().length > 0;
  const showNutrition = drink.showNutrition ?? true;

  const metadata: string[] = [`${drink.volumeML} ml`];
  if (showNutrition) {
    if (drink.showCalories ?? true) metadata.push(`${drink.calories} kcal`);
    if ((drink.showProtein ?? true) && (drink.proteinG ?? 0) > 0)
      metadata.push(`${drink.proteinG}g protein`);
    if ((drink.showCarbs ?? false) && (drink.carbsG ?? 0) > 0)
      metadata.push(`${drink.carbsG}g ${menuCopy.carbsShort}`);
    if ((drink.showFat ?? false) && (drink.fatG ?? 0) > 0)
      metadata.push(`${drink.fatG}g ${menuCopy.fatShort}`);
    if ((drink.showFiber ?? false) && (drink.fiberG ?? 0) > 0)
      metadata.push(`${drink.fiberG}g fiber`);
    if ((drink.showCaffeine ?? true) && (drink.caffeineMg ?? 0) > 0)
      metadata.push(`${drink.caffeineMg} mg ${menuCopy.caffeineShort}`);
  }

  return (
    <View style={styles.card}>
      <View style={styles.imageWrap}>
        {showImage ? (
          <Image
            source={{ uri: drink.image }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            onError={() => setImageFailed(true)}
            accessibilityLabel={drink.name}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <CupSoda size={28} color="rgba(255,255,255,0.2)" />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText variant="bodyMedium" style={styles.title} numberOfLines={2}>
            {drink.name}
          </ThemedText>
          <ThemedText style={styles.price}>{priceKr} kr</ThemedText>
        </View>

        {drink.description ? (
          <ThemedText variant="caption" color="textTertiary" numberOfLines={1}>
            {drink.description}
          </ThemedText>
        ) : null}

        <ThemedText style={styles.metadata} numberOfLines={2}>
          {metadata.join("  ·  ")}
        </ThemedText>
      </View>
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
  body: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
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
  metadata: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
});
