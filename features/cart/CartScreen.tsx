import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import {
  AlertTriangle,
  Menu,
  Minus,
  Plus,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { useCart } from "@/context/CartContext";
import type { CartItem } from "@/types/cart";
import { CUSTOMER_SIZE_OPTIONS, MEAL_SIZES, previewMealPriceOre } from "@/utils/pricing";
import { formatPriceKr, krToOre } from "@/utils/money";
import { normalizeMacroSnapshot } from "@/utils/macroMath";
import { cartCopy as copy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Cart screen — port of the web src/app/varukorg/page.tsx item list, empty
 * state and order summary. Per-line pricing/macros/grams are copied
 * formula-for-formula from the web page (fixed-meal öre rounding vs custom
 * float path, round-then-multiply macro scaling, S/M/L short labels,
 * volumeML for drinks, out-of-stock warning on `meal.available === false`).
 *
 * DELIBERATELY NOT PORTED YET (Feature 7 — checkout): payment methods,
 * customer note, auth gate, reserve/pay CTA, Stripe cancel-resume banner,
 * closed-store banner, log-to-profile section, drink upsell. This screen
 * ends at the summary card.
 *
 * Mobile addition per the Feature 4 contract: an in-cart M/L size switcher
 * on regular meal lines (web has no in-cart size change) — hidden for
 * drinks, custom lines and fixed-portion meals.
 */

const SIZE_LABEL_SHORT: Record<string, string> = {
  small: "S",
  medium: "M",
  large: "L",
};

export function CartScreen() {
  const { items, hydrated } = useCart();

  return (
    <Screen>
      {/* Header — web's sticky cart header, sans back button (this is a tab
          root, not a pushed route). Visual decision: preliminary (Fable
          design source still missing). */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>{copy.title}</ThemedText>
      </View>

      {!hydrated ? (
        <View style={styles.center}>
          <LoadingIndicator />
        </View>
      ) : items.length === 0 ? (
        <EmptyCart />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          <SectionHead>
            {(() => {
              const mealCount = items.filter((i) => i.kind !== "drink").length;
              const drinkCount = items.filter((i) => i.kind === "drink").length;
              const parts: string[] = [];
              if (mealCount > 0) parts.push(copy.countMeal(mealCount));
              if (drinkCount > 0) parts.push(copy.countDrink(drinkCount));
              return parts.join(" · ");
            })()}
          </SectionHead>

          {items.map((item) => (
            <CartItemCard key={item.id} item={item} />
          ))}

          <SectionHead style={{ marginTop: spacing[5] }}>{copy.summaryHead}</SectionHead>
          <SummaryCard />
        </ScrollView>
      )}
    </Screen>
  );
}

/* ── Item card ─────────────────────────────────────────────── */

function CartItemCard({ item }: { item: CartItem }) {
  const { updateQuantity, updateSize, removeItem } = useCart();

  const isDrink = item.kind === "drink";
  const size = isDrink ? undefined : MEAL_SIZES.find((s) => s.id === item.sizeId);
  const multiplier = size?.priceMultiplier ?? 1;
  const macroMult = size?.macroMultiplier ?? 1;
  const surcharge = item.ingredientSurchargeKr ?? 0;
  // Fixed meal: keep the cart preview in lockstep with the backend's öre
  // rounding. Custom/Nutri Anpassar keeps its float approximation since the
  // backend recomputes that path. (Verbatim web logic.)
  const isFixedMeal = !isDrink && !item.isCustom && surcharge === 0;
  const unitPriceKr =
    isDrink && item.drink
      ? item.drink.priceOre / 100
      : isFixedMeal
        ? previewMealPriceOre(item.meal.basePrice, multiplier) / 100
        : item.meal.basePrice * multiplier + surcharge;
  const linePriceKr = isFixedMeal
    ? (previewMealPriceOre(item.meal.basePrice, multiplier) * item.quantity) / 100
    : unitPriceKr * item.quantity;

  const macros =
    item.isCustom && item.customMacros
      ? normalizeMacroSnapshot(item.customMacros)
      : normalizeMacroSnapshot({
          calories: Math.round(item.meal.macros.calories * macroMult),
          proteinG: Math.round(item.meal.macros.proteinG * macroMult),
          carbsG: Math.round(item.meal.macros.carbsG * macroMult),
          fatG: Math.round(item.meal.macros.fatG * macroMult),
          fiberG: Math.round(item.meal.macros.fiberG * macroMult),
        });

  const totalGramsBase = item.meal.ingredients.reduce((s, ing) => s + (ing.amountG ?? 0), 0);
  const grams =
    !isDrink && totalGramsBase > 0 ? `${Math.round(totalGramsBase * macroMult)}g` : null;
  const sizeShort = isDrink
    ? item.drink?.volumeML
      ? `${item.drink.volumeML} ml`
      : null
    : (SIZE_LABEL_SHORT[item.sizeId] ?? size?.label ?? "M");
  const isUnavailable = item.meal.available === false;
  const canSwitchSize = !isDrink && !item.isCustom && item.meal.portionMode !== "fixed";

  return (
    <View style={styles.itemWrap}>
      <View style={[styles.itemCard, isUnavailable && styles.itemCardUnavailable]}>
        {/* Top: image + body */}
        <View style={styles.itemTop}>
          <View style={styles.itemImageWrap}>
            {item.meal.image ? (
              <Image
                source={{ uri: item.meal.image }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityLabel={item.meal.name}
              />
            ) : (
              <View style={styles.itemImagePlaceholder}>
                <UtensilsCrossed size={20} color="rgba(255,255,255,0.2)" />
              </View>
            )}
          </View>

          <View style={styles.itemBody}>
            <View>
              <View style={styles.itemTitleRow}>
                <ThemedText style={styles.itemName} numberOfLines={2}>
                  {item.meal.name}
                </ThemedText>
                {item.isCustom ? (
                  <View style={styles.customBadge}>
                    <ThemedText style={styles.customBadgeText}>{copy.itemCustom}</ThemedText>
                  </View>
                ) : null}
                {item.slot ? (
                  <View style={styles.slotBadge}>
                    <ThemedText style={styles.slotBadgeText}>{item.slot.toUpperCase()}</ThemedText>
                  </View>
                ) : null}
              </View>
              <View style={styles.itemMetaRow}>
                {sizeShort || grams ? (
                  <View style={styles.sizePill}>
                    <ThemedText style={styles.sizePillText}>
                      {sizeShort}
                      {grams ? ` · ${grams}` : ""}
                    </ThemedText>
                  </View>
                ) : null}
                {!isDrink && (
                  <>
                    <ThemedText style={styles.metaDot}>·</ThemedText>
                    <ThemedText style={[styles.metaText, { color: colors.accent, fontFamily: fontFamily.monoMedium }]}>
                      {macros.proteinG}g
                    </ThemedText>
                    <ThemedText style={styles.metaDot}>·</ThemedText>
                    <ThemedText style={styles.metaText}>{macros.calories} kcal</ThemedText>
                  </>
                )}
              </View>
            </View>

            <View style={styles.itemPriceRow}>
              <ThemedText style={styles.linePrice}>{formatPriceKr(krToOre(linePriceKr))}</ThemedText>
              {item.quantity > 1 && (
                <ThemedText style={styles.unitPrice}>
                  {formatPriceKr(krToOre(unitPriceKr))} × {item.quantity}
                </ThemedText>
              )}
            </View>
          </View>
        </View>

        {/* Footer: qty stepper + size switch + remove */}
        <View style={styles.itemFooter}>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => updateQuantity(item.id, item.quantity - 1)}
              style={styles.stepperButton}
              accessibilityRole="button"
              accessibilityLabel={copy.qtyDecrease}
            >
              <Minus size={12} color="rgba(255,255,255,0.5)" strokeWidth={2} />
            </Pressable>
            <ThemedText style={styles.stepperValue}>{item.quantity}</ThemedText>
            <Pressable
              onPress={() => updateQuantity(item.id, item.quantity + 1)}
              style={styles.stepperButton}
              accessibilityRole="button"
              accessibilityLabel={copy.qtyIncrease}
            >
              <Plus size={12} color="rgba(255,255,255,0.5)" strokeWidth={2} />
            </Pressable>
          </View>

          {canSwitchSize && (
            <View style={styles.sizeGroup}>
              {CUSTOMER_SIZE_OPTIONS.map((s) => {
                const isSelected = item.sizeId === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => updateSize(item.id, s.id)}
                    style={[styles.sizeButton, isSelected && styles.sizeButtonSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={s.label}
                  >
                    <ThemedText style={[styles.sizeLabel, isSelected && styles.sizeLabelSelected]}>
                      {s.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable
            onPress={() => removeItem(item.id)}
            style={styles.removeButton}
            accessibilityRole="button"
            accessibilityLabel={copy.itemRemove}
          >
            <X size={13} color="rgba(255,255,255,0.25)" strokeWidth={1.6} />
            <ThemedText style={styles.removeText}>{copy.itemRemove}</ThemedText>
          </Pressable>
        </View>
      </View>

      {isUnavailable && (
        <View style={styles.unavailableBox}>
          <AlertTriangle size={13} color={colors.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.unavailableHeading}>{copy.stockOutHeading}</ThemedText>
            <ThemedText style={styles.unavailableName}>
              {item.meal.name}
              {sizeShort ? ` · ${sizeShort}` : ""}
            </ThemedText>
            <ThemedText style={styles.unavailableText}>{copy.stockOutText}</ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

/* ── Summary (web: Delsumma / Upphämtning Gratis / Totalt) ── */

function SummaryCard() {
  const { subtotalOre, totalOre } = useCart();
  return (
    <View style={styles.summaryCard}>
      <SummaryRow label={copy.summarySubtotal} value={formatPriceKr(subtotalOre)} />
      <SummaryRow label={copy.summaryPickup} value={copy.summaryFree} valueMuted />
      <SummaryRow label={copy.summaryTotal} value={formatPriceKr(totalOre)} isTotal />
    </View>
  );
}

function SummaryRow({
  label,
  value,
  valueMuted,
  isTotal,
}: {
  label: string;
  value: string;
  valueMuted?: boolean;
  isTotal?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, isTotal && styles.summaryRowTotal]}>
      <ThemedText style={[styles.summaryLabel, isTotal && styles.summaryLabelTotal]}>
        {label}
      </ThemedText>
      <ThemedText
        style={[
          styles.summaryValue,
          isTotal && styles.summaryValueTotal,
          valueMuted && styles.summaryValueMuted,
        ]}
      >
        {value}
      </ThemedText>
    </View>
  );
}

/* ── Empty state (port of the web EmptyCart, static ring) ──── */

function EmptyCart() {
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={styles.emptyContent}>
      <View style={styles.emptyCard}>
        <View style={styles.emptyIconWrap}>
          <View style={styles.emptyIconRing} />
          <View style={styles.emptyIconInner}>
            <ShoppingBag size={32} strokeWidth={1.75} color={colors.accent} />
          </View>
        </View>
        <ThemedText style={styles.emptyHeading}>{copy.emptyHeading}</ThemedText>
        <ThemedText style={styles.emptyText}>{copy.emptyText}</ThemedText>
        <Pressable
          onPress={() => router.navigate("/(tabs)/meny")}
          style={({ pressed }) => [styles.emptyCta, pressed && { backgroundColor: colors.accentHover }]}
          accessibilityRole="button"
          accessibilityLabel={copy.emptyCta}
        >
          <Menu size={14} color={colors.textPrimary} strokeWidth={1.75} />
          <ThemedText style={styles.emptyCtaText}>{copy.emptyCta}</ThemedText>
        </Pressable>
      </View>
      <ThemedText style={styles.emptySubline}>{copy.emptySubline}</ThemedText>
    </ScrollView>
  );
}

/* ── Local helpers ─────────────────────────────────────────── */

function SectionHead({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <ThemedText style={[styles.sectionHead, style]}>{children}</ThemedText>;
}

const styles = StyleSheet.create({
  header: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  sectionHead: {
    marginHorizontal: spacing[1],
    marginTop: spacing[5],
    marginBottom: spacing[3],
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    color: colors.textMuted,
    textTransform: "uppercase",
  },

  /* Item card */
  itemWrap: { marginBottom: spacing[3] },
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  itemCardUnavailable: { borderColor: "rgba(232,101,10,0.30)" },
  itemTop: { flexDirection: "row", alignItems: "stretch" },
  itemImageWrap: { width: 96, minHeight: 96, backgroundColor: colors.cardAlt },
  itemImagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  itemBody: {
    flex: 1,
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  itemTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], flexWrap: "wrap" },
  itemName: {
    fontSize: 14,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  customBadge: {
    backgroundColor: "rgba(232,101,10,0.14)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  customBadgeText: { fontSize: 10, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  slotBadge: {
    backgroundColor: "rgba(232,101,10,0.18)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.3)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  slotBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.8,
    color: colors.accent,
  },
  itemMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  sizePill: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sizePillText: {
    fontSize: 10.5,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 0.3,
    color: "rgba(255,255,255,0.5)",
  },
  metaDot: { fontSize: 11, color: "rgba(255,255,255,0.25)" },
  metaText: { fontSize: 11.5, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.35)" },
  itemPriceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  linePrice: {
    fontSize: 15,
    fontFamily: fontFamily.monoMedium,
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  unitPrice: { fontSize: 11, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.25)" },
  itemFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 2,
  },
  stepperButton: { height: 30, width: 32, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  stepperValue: {
    width: 28,
    textAlign: "center",
    fontSize: 13,
    fontFamily: fontFamily.monoMedium,
    color: colors.textPrimary,
  },
  sizeGroup: {
    flexDirection: "row",
    gap: spacing[1],
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 3,
  },
  sizeButton: { height: 26, width: 32, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  sizeButtonSelected: { backgroundColor: colors.accent },
  sizeLabel: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: "rgba(255,255,255,0.45)" },
  sizeLabelSelected: { color: colors.textPrimary },
  removeButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  removeText: { fontSize: 11.5, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.25)" },

  /* Unavailable warning */
  unavailableBox: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: spacing[1],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.28)",
    backgroundColor: "rgba(18,6,0,0.85)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  unavailableHeading: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  unavailableName: { marginTop: 2, fontSize: 11.5, color: "rgba(255,255,255,0.5)" },
  unavailableText: { marginTop: 2, fontSize: 11, color: "rgba(255,255,255,0.35)" },

  /* Summary */
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  summaryRowTotal: { borderBottomWidth: 0, paddingVertical: spacing[4] },
  summaryLabel: { fontSize: 13.5, color: colors.textSecondary },
  summaryLabelTotal: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  summaryValue: {
    fontSize: 13.5,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  summaryValueTotal: { fontSize: 16, fontFamily: fontFamily.monoMedium },
  summaryValueMuted: { fontSize: 11, color: "rgba(255,255,255,0.28)" },

  /* Empty state */
  emptyContent: { flexGrow: 1, paddingHorizontal: spacing[4], paddingTop: spacing[10] },
  emptyCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 32,
    overflow: "hidden",
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  emptyIconRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.12)",
  },
  emptyIconInner: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    bottom: 14,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.08)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.18)",
  },
  emptyHeading: {
    textAlign: "center",
    fontSize: 20,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.4,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: "center",
    alignSelf: "center",
    maxWidth: 260,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: 28,
  },
  emptyCta: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  emptyCtaText: { fontSize: 14.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  emptySubline: {
    marginTop: 22,
    textAlign: "center",
    fontSize: 11.5,
    letterSpacing: 0.2,
    color: "rgba(255,255,255,0.28)",
  },
});
