import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useReducedMotion } from "react-native-reanimated";
import { Check, ChevronLeft, ChevronRight, CupSoda, Plus } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiDrink } from "@/services/api/drinks";
import { useCart } from "@/context/CartContext";
import { formatNumber, useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { getGoWellVisual } from "./goWellFlavors";

/**
 * GoWell flavour carousel (patch 11) — ONE product family, several
 * flavours. A horizontal snap carousel shows one can in focus with the
 * neighbours peeking at the edges; the background wash cross-fades and the
 * can scales subtly as the user swipes (scroll-driven RN Animated — no new
 * animation library). Name/description/price/CTA below always describe the
 * ACTIVE flavour and switch when a page becomes active.
 *
 * - Products, prices, stock and images come from the backend ApiDrink list
 *   the parent pre-filters with isGoWellDrink — nothing hardcoded.
 * - "Lägg till" calls the SAME addDrinkItem path as DrinkCard with the
 *   active flavour's real ApiDrink (drinks-only payment rule untouched).
 * - Never auto-advances. Arrow buttons mirror the swipe for screen-reader
 *   and switch-access users; dots + "1 av N" show position (hidden when
 *   there is only one flavour).
 * - Reduced motion: no scale transform and a static active background.
 * - Missing image → neutral CupSoda placeholder, layout intact.
 */
export function GoWellFlavorCarousel({ drinks }: { drinks: ApiDrink[] }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { addDrinkItem } = useCart();
  const reducedMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();

  // Card geometry: one card in focus, neighbours peeking. The list has
  // horizontal padding of (windowWidth - cardWidth) / 2 so the first and
  // last card can center too.
  const cardWidth = Math.min(windowWidth * 0.62, 260);
  const sidePadding = (windowWidth - spacing[4] * 2 - cardWidth) / 2;

  const [activeIndex, setActiveIndex] = useState(0);
  const active = drinks[Math.min(activeIndex, drinks.length - 1)] ?? null;
  const listRef = useRef<Animated.FlatList<ApiDrink>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const [added, setAdded] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    },
    []
  );
  // Switching flavour cancels the "Tillagd" confirmation — the CTA must
  // always describe the active flavour.
  useEffect(() => {
    setAdded(false);
  }, [activeIndex]);

  const visuals = useMemo(() => drinks.map(getGoWellVisual), [drinks]);
  const activeVisual = visuals[Math.min(activeIndex, visuals.length - 1)] ?? null;

  if (drinks.length === 0 || !active || !activeVisual) return null;

  const outOfStock = !active.isAvailable || active.stockQuantity === 0;
  const priceKr = Math.round(active.priceOre / 100);
  const single = drinks.length === 1;

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(drinks.length - 1, index));
    listRef.current?.scrollToOffset({
      offset: clamped * cardWidth,
      animated: !reducedMotion,
    });
    setActiveIndex(clamped);
  };

  const handleAdd = () => {
    if (outOfStock || added) return;
    addDrinkItem(active);
    setAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setAdded(false), 1800);
  };

  return (
    <View style={styles.container}>
      {/* Cross-fading flavour backgrounds — one gradient per flavour with
          scroll-interpolated opacity, so the wash blends during the swipe.
          Reduced motion: only the active flavour's wash, statically. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {visuals.map((visual, i) => {
          const opacity = reducedMotion
            ? i === activeIndex
              ? 1
              : 0
            : scrollX.interpolate({
                inputRange: [(i - 1) * cardWidth, i * cardWidth, (i + 1) * cardWidth],
                outputRange: [0, 1, 0],
                extrapolate: "clamp",
              });
          return (
            <Animated.View key={drinks[i].id} style={[StyleSheet.absoluteFill, { opacity }]}>
              <LinearGradient
                colors={[...visual.gradient]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          );
        })}
      </View>

      {/* Brand row */}
      <View style={styles.brandRow}>
        <ThemedText style={styles.brandTitle}>GoWell</ThemedText>
        <ThemedText style={styles.brandSub}>{t("menu.gowell.subtitle")}</ThemedText>
      </View>

      {/* Can carousel */}
      <Animated.FlatList
        ref={listRef}
        data={drinks}
        keyExtractor={(d) => d.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: sidePadding }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
          setActiveIndex(Math.max(0, Math.min(drinks.length - 1, index)));
        }}
        renderItem={({ item, index }) => {
          const scale = reducedMotion
            ? 1
            : scrollX.interpolate({
                inputRange: [(index - 1) * cardWidth, index * cardWidth, (index + 1) * cardWidth],
                outputRange: [0.9, 1, 0.9],
                extrapolate: "clamp",
              });
          const canImage = item.image.trim().length > 0;
          return (
            <Animated.View style={[styles.canSlot, { width: cardWidth, transform: [{ scale }] }]}>
              {canImage ? (
                <Image
                  source={{ uri: item.image }}
                  style={styles.canImage}
                  contentFit="contain"
                  transition={150}
                  accessibilityLabel={item.name}
                />
              ) : (
                <View style={[styles.canImage, styles.canPlaceholder]}>
                  <CupSoda size={44} color="rgba(255,255,255,0.25)" />
                </View>
              )}
            </Animated.View>
          );
        }}
      />

      {/* Active flavour — name, description, price. Text switches when the
          page becomes active (state), never mid-swipe. */}
      <View style={styles.flavorInfo}>
        <ThemedText
          style={[styles.flavorName, { color: activeVisual.accent }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {active.name}
        </ThemedText>
        {active.description ? (
          <ThemedText variant="caption" style={styles.flavorDescription} numberOfLines={3}>
            {active.description}
          </ThemedText>
        ) : null}
        <ThemedText style={styles.priceRow}>
          <ThemedText style={styles.price}>{formatNumber(priceKr, language)} kr</ThemedText>
          <ThemedText variant="caption" style={styles.volume}>
            {"  ·  "}
            {active.volumeML} ml
          </ThemedText>
        </ThemedText>
      </View>

      {/* Swipe indicator: arrows (a11y alternative to swipe) + dots + "1 av N".
          Hidden entirely for a single flavour. */}
      {!single ? (
        <View style={styles.pagination}>
          <Pressable
            onPress={() => goTo(activeIndex - 1)}
            disabled={activeIndex === 0}
            style={[styles.arrow, activeIndex === 0 && styles.arrowDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t("menu.gowell.previousFlavor")}
          >
            <ChevronLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
          </Pressable>

          <View style={styles.dotsRow}>
            {drinks.map((d, i) => (
              <View
                key={d.id}
                style={[
                  styles.dot,
                  i === activeIndex && { backgroundColor: activeVisual.accent, width: 16 },
                ]}
              />
            ))}
          </View>

          <Pressable
            onPress={() => goTo(activeIndex + 1)}
            disabled={activeIndex === drinks.length - 1}
            style={[styles.arrow, activeIndex === drinks.length - 1 && styles.arrowDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t("menu.gowell.nextFlavor")}
          >
            <ChevronRight size={16} color={colors.textPrimary} strokeWidth={2.25} />
          </Pressable>
        </View>
      ) : null}
      {!single ? (
        <ThemedText variant="caption" style={styles.counter}>
          {t("menu.gowell.counter", { current: activeIndex + 1, total: drinks.length })}
        </ThemedText>
      ) : null}

      {/* Add the ACTIVE flavour — same addDrinkItem path as DrinkCard. */}
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
          outOfStock
            ? t("menu.soldOutToday")
            : added
              ? t("menu.added")
              : t("menu.gowell.addFlavor", { flavor: active.name })
        }
      >
        {outOfStock ? (
          <ThemedText style={styles.addLabelLocked}>{t("menu.soldOutToday")}</ThemedText>
        ) : added ? (
          <>
            <Check size={13} color={colors.accent} strokeWidth={2.5} />
            <ThemedText style={[styles.addLabel, { color: colors.accent }]}>
              {t("menu.added")}
            </ThemedText>
          </>
        ) : (
          <>
            <Plus size={13} color={colors.textPrimary} strokeWidth={2.5} />
            <ThemedText style={styles.addLabel}>{t("mealDetail.add")}</ThemedText>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
    paddingVertical: spacing[4],
    gap: spacing[2],
  },
  brandRow: {
    alignItems: "center",
    gap: 1,
    paddingHorizontal: spacing[4],
  },
  brandTitle: {
    fontSize: 20,
    fontFamily: fontFamily.headline,
    letterSpacing: 1.2,
    color: colors.textPrimary,
  },
  brandSub: {
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  canSlot: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[2],
  },
  canImage: {
    width: "78%",
    aspectRatio: 0.62,
    maxHeight: 210,
  },
  canPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.card,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  flavorInfo: {
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing[5],
  },
  flavorName: {
    fontSize: 17,
    fontFamily: fontFamily.headlineSemibold,
    letterSpacing: -0.2,
  },
  flavorDescription: {
    textAlign: "center",
    color: colors.textSecondary,
    lineHeight: 16,
  },
  priceRow: {
    marginTop: 2,
  },
  price: {
    fontSize: 15,
    fontFamily: fontFamily.monoMedium,
    color: colors.textPrimary,
  },
  volume: {
    color: colors.textTertiary,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  arrow: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  arrowDisabled: {
    opacity: 0.35,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  counter: {
    textAlign: "center",
    color: colors.textTertiary,
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
  },
  addButton: {
    marginTop: spacing[1],
    marginHorizontal: spacing[4],
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
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
    fontSize: 13.5,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.3,
    color: colors.textPrimary,
  },
  addLabelLocked: {
    fontSize: 13,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.3,
    color: "rgba(255,255,255,0.45)",
  },
});
