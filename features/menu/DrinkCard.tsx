import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Check, CupSoda, Plus } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiDrink } from "@/services/api/drinks";
import { useCart } from "@/context/CartContext";
import { mealDetailCopy, menuCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Drink card — mobile port of the web /meny DrinkCard's always-visible
 * metadata row. The admin-controlled show* flags gate every nutrition field
 * exactly as on the web (same defaults as the backend DTO): showNutrition
 * gates the whole group; calories shows even when 0 (e.g. NOCCO); the
 * gram/mg fields additionally require a value > 0.
 *
 * "Lägg till" goes through addDrinkItem (never addItem) — the web card's own
 * comment explains why: the drink path stamps kind:"drink" + the ApiDrink on
 * the cart line, which the drinks-only payment gate and the order payload
 * mapping both depend on. Same 1.8s "Tillagd" confirmation as the web.
 *
 * Mobile addition: the CTA is locked when the drink is unavailable or the
 * public endpoint reports 0 stock (the menu list already hides those, so
 * this is belt-and-braces for a list that refreshes while the card is
 * visible; the web has no such lock). stockQuantity is publicly obfuscated
 * to 0/1 — only compared to 0, never displayed.
 *
 * The web card's expandable detail grid is intentionally not ported —
 * mobile cards stay single-state until the (missing) Fable design source
 * says otherwise. Preliminary design decision.
 */
export function DrinkCard({ drink }: { drink: ApiDrink }) {
  const { addDrinkItem } = useCart();
  const [imageFailed, setImageFailed] = useState(false);
  const [added, setAdded] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    },
    []
  );

  const priceKr = Math.round(drink.priceOre / 100);
  const showImage = !imageFailed && drink.image.trim().length > 0;
  const showNutrition = drink.showNutrition ?? true;
  const outOfStock = !drink.isAvailable || drink.stockQuantity === 0;

  const handleAdd = () => {
    if (outOfStock || added) return;
    addDrinkItem(drink);
    setAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setAdded(false), 1800);
  };

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

      {/* Footer: add-to-cart (web card's bottom-right button) */}
      <View style={styles.footer}>
        <Pressable
          onPress={handleAdd}
          disabled={outOfStock || added}
          style={({ pressed }) => [
            styles.addButton,
            added && styles.addButtonAdded,
            outOfStock && styles.addButtonLocked,
            pressed && !added && !outOfStock && { backgroundColor: colors.accentHover },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: outOfStock || added }}
          accessibilityLabel={
            outOfStock ? menuCopy.soldOutToday : added ? menuCopy.added : mealDetailCopy.add
          }
        >
          {outOfStock ? (
            <ThemedText style={styles.addLabelLocked}>{menuCopy.soldOutToday}</ThemedText>
          ) : added ? (
            <>
              <Check size={12} color={colors.accent} strokeWidth={2.5} />
              <ThemedText style={[styles.addLabel, { color: colors.accent }]}>
                {menuCopy.added}
              </ThemedText>
            </>
          ) : (
            <>
              <Plus size={12} color={colors.textPrimary} strokeWidth={2.5} />
              <ThemedText style={styles.addLabel}>{mealDetailCopy.add}</ThemedText>
            </>
          )}
        </Pressable>
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
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    paddingTop: spacing[1],
  },
  addButton: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    borderRadius: radius.btn,
    backgroundColor: colors.accent,
  },
  addButtonAdded: {
    backgroundColor: "rgba(232,101,10,0.14)",
    borderWidth: 1.5,
    borderColor: "rgba(232,101,10,0.3)",
  },
  addButtonLocked: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  addLabel: {
    fontSize: 13,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.3,
    color: colors.textPrimary,
  },
  addLabelLocked: {
    fontSize: 12.5,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.3,
    color: "rgba(255,255,255,0.45)",
  },
});
