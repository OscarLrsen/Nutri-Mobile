import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Minus, Plus, ShoppingCart, UtensilsCrossed } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { ErrorState } from "@/components/feedback/ErrorState";
import { getMealById, getMealAvailability } from "@/services/api/meals";
import { getIngredients } from "@/services/api/ingredients";
import { getStoreStatus } from "@/services/api/store";
import { CUSTOMER_SIZE_OPTIONS, previewMealPriceOre } from "@/utils/pricing";
import { formatPriceKr } from "@/utils/money";
import { mealDetailCopy as copy, menuCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Meal detail — mobile port of the web (customer)/meal/[id]/page.tsx,
 * ported section-for-section: sticky header (back / NUTRI wordmark / cart),
 * hero image with gradient fade + badge, title + description + compact
 * kcal·protein row, closed-store note, 4-column macro grid (protein
 * highlighted), size selector as radio rows with per-size price/grams/stock
 * pills (small customer-hidden; hidden entirely for fixed-portion meals),
 * ingredient list with size-scaled grams, allergy note, and a sticky bottom
 * bar with quantity stepper + CTA showing the öre-precise total.
 *
 * Additions vs the web detail page: an aggregated "Allergener: …" line
 * (the web shows that on the /meny card — same allergen-map mechanism via
 * public GET /api/ingredients — surfacing it here too since mobile cards
 * link to this screen for the full story).
 *
 * Feature-scope limits: the CTA does NOT add to a cart yet (feature 4) —
 * it shows an honest "kommer snart" notice. The web's breakfast time-window
 * lock (isBreakfastTime) is not ported yet (serviceWindows.ts pending).
 */

const LOW_STOCK_THRESHOLD = 3;

export function MealDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const mealQuery = useQuery({
    queryKey: ["meals", id],
    queryFn: () => getMealById(id),
    enabled: !!id,
  });
  // Failure swallowed to null — backend stock validation at order create
  // remains the safety net (web parity).
  const availabilityQuery = useQuery({
    queryKey: ["meals", id, "availability"],
    queryFn: () => getMealAvailability(id).catch(() => null),
    enabled: !!id,
  });
  const ingredientsQuery = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => getIngredients().catch(() => []),
    staleTime: 5 * 60_000,
  });
  const storeStatusQuery = useQuery({ queryKey: ["store", "status"], queryFn: getStoreStatus });

  const meal = mealQuery.data ?? null;
  const availability = availabilityQuery.data ?? null;
  const isFixed = meal?.portionMode === "fixed";
  const isClosed = storeStatusQuery.data?.status === "Closed";

  const [selectedSize, setSelectedSize] = useState<string>("medium");
  const [quantity, setQuantity] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);

  const stockBySize = useMemo(() => {
    if (!availability) {
      return {
        medium: { soldOut: false, count: null as number | null },
        large: { soldOut: false, count: null as number | null },
      };
    }
    return {
      medium: { soldOut: availability.medium.soldOut === true, count: availability.medium.count ?? null },
      large: { soldOut: availability.large.soldOut === true, count: availability.large.count ?? null },
    };
  }, [availability]);

  const allSoldOut = Boolean(availability) && stockBySize.medium.soldOut && stockBySize.large.soldOut;

  // Auto-shift off a size that's just gone sold-out (web parity).
  useEffect(() => {
    if (!availability) return;
    if (!stockBySize[selectedSize as "medium" | "large"]?.soldOut) return;
    const fallback = CUSTOMER_SIZE_OPTIONS.find(
      (s) => !stockBySize[s.id as "medium" | "large"].soldOut
    );
    if (fallback) setSelectedSize(fallback.id);
  }, [availability, selectedSize, stockBySize]);

  const effectiveSize = isFixed ? "medium" : selectedSize;
  const sizeDef =
    CUSTOMER_SIZE_OPTIONS.find((s) => s.id === effectiveSize) ?? CUSTOMER_SIZE_OPTIONS[0];

  const macros = useMemo(() => {
    if (!meal) return null;
    return {
      calories: Math.round(meal.macros.calories * sizeDef.macroMultiplier),
      proteinG: Math.round(meal.macros.proteinG * sizeDef.macroMultiplier),
      carbsG: Math.round(meal.macros.carbsG * sizeDef.macroMultiplier),
      fatG: Math.round(meal.macros.fatG * sizeDef.macroMultiplier),
    };
  }, [meal, sizeDef]);

  const totalGramsBase = useMemo(
    () => (meal ? meal.ingredients.reduce((sum, ing) => sum + (ing.amountG ?? 0), 0) : 0),
    [meal]
  );

  // Aggregated allergens — same mechanism as the web /meny card: unique
  // allergen union across the meal's library-linked ingredients.
  const mealAllergens = useMemo(() => {
    if (!meal || !ingredientsQuery.data) return [];
    const byId = new Map(ingredientsQuery.data.map((ing) => [ing.id, ing.allergens]));
    return Array.from(
      new Set(
        meal.ingredients.flatMap((ing) => (ing.ingredientId ? (byId.get(ing.ingredientId) ?? []) : []))
      )
    );
  }, [meal, ingredientsQuery.data]);

  // Öre all the way; formatted only at render (web computes the same product).
  const totalOre = meal ? previewMealPriceOre(meal.basePrice, sizeDef.priceMultiplier) * quantity : 0;

  const selected = stockBySize[effectiveSize as "medium" | "large"] ?? { soldOut: false, count: null };
  const showLowStock =
    !selected.soldOut &&
    selected.count !== null &&
    selected.count > 0 &&
    selected.count <= LOW_STOCK_THRESHOLD;
  const stockLocked = allSoldOut || selected.soldOut;

  const handleAdd = () => {
    // Feature 4 (varukorg) is not built yet — honest placeholder, no cart mutation.
    Alert.alert("Kommer snart", "Varukorgen byggs i nästa steg av appen.");
  };

  if (mealQuery.isLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <LoadingIndicator label={`${copy.loading}...`} />
      </View>
    );
  }

  if (mealQuery.isError || !meal) {
    return (
      <View style={[styles.root, styles.center]}>
        <ErrorState message={copy.notFound} onRetry={() => router.back()} />
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <ThemedText variant="body" color="accent" style={styles.backLink}>
            {copy.backToMenu}
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  const showImage = !imageFailed && meal.image.trim().length > 0;

  return (
    <View style={styles.root}>
      {/* ── Sticky header: back / NUTRI / cart ── */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Tillbaka"
        >
          <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
        </Pressable>
        <ThemedText style={styles.wordmark}>NUTRI</ThemedText>
        <Pressable
          onPress={() => router.navigate("/(tabs)/varukorg")}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Öppna varukorgen"
        >
          <ShoppingCart size={16} color={colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        {/* ── Hero image ── */}
        <View style={styles.hero}>
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
            <View style={styles.heroPlaceholder}>
              <UtensilsCrossed size={40} color="rgba(255,255,255,0.2)" />
            </View>
          )}
          <LinearGradient
            colors={["rgba(17,17,17,0)", colors.bg]}
            style={styles.heroGradient}
            pointerEvents="none"
          />
          {meal.badgeText ? (
            <View style={styles.badge}>
              <ThemedText style={styles.badgeText}>{meal.badgeText.toUpperCase()}</ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.content}>
          {/* ── Title block ── */}
          <ThemedText style={styles.title}>{meal.name}</ThemedText>
          {meal.description ? (
            <ThemedText variant="caption" style={styles.description}>
              {meal.description}
            </ThemedText>
          ) : null}
          <View style={styles.compactMacroRow}>
            <ThemedText style={styles.compactMacro}>{macros?.calories} kcal</ThemedText>
            <ThemedText style={styles.compactDot}>·</ThemedText>
            <ThemedText style={[styles.compactMacro, { color: colors.accent }]}>
              {macros?.proteinG}g protein
            </ThemedText>
            {!isFixed && (
              <>
                <ThemedText style={styles.compactDot}>·</ThemedText>
                <ThemedText style={[styles.compactMacro, { opacity: 0.6, fontSize: 11 }]}>
                  {copy.sizeNames[effectiveSize]}
                </ThemedText>
              </>
            )}
          </View>
          {isClosed && (
            <ThemedText variant="caption" style={styles.closedNote}>
              {copy.closedNote}
            </ThemedText>
          )}

          <Divider />

          {/* ── Full macros ── */}
          <SectionHead>
            {isFixed ? copy.nutrition : `${copy.nutrition} · ${copy.sizeNames[effectiveSize]}`}
            {totalGramsBase > 0
              ? ` (${Math.round(totalGramsBase * sizeDef.macroMultiplier)}g)`
              : ""}
          </SectionHead>
          <View style={styles.macroGrid}>
            {[
              { val: macros?.proteinG ?? 0, unit: "g", label: copy.macroProtein, hi: true },
              { val: macros?.carbsG ?? 0, unit: "g", label: copy.macroCarbs, hi: false },
              { val: macros?.fatG ?? 0, unit: "g", label: copy.macroFat, hi: false },
              { val: macros?.calories ?? 0, unit: "", label: "kcal", hi: false },
            ].map((m) => (
              <View key={m.label} style={[styles.macroCell, m.hi && styles.macroCellHi]}>
                <ThemedText style={[styles.macroVal, m.hi && { color: colors.accent }]}>
                  {m.val}
                  {m.unit ? <ThemedText style={styles.macroUnit}>{m.unit}</ThemedText> : null}
                </ThemedText>
                <ThemedText style={styles.macroLabel}>{m.label.toUpperCase()}</ThemedText>
              </View>
            ))}
          </View>

          {/* ── Size selector (radio rows) — hidden for fixed-portion meals ── */}
          {!isFixed && (
            <>
              <Divider />
              <SectionHead>{copy.chooseSize}</SectionHead>
              <View style={styles.sizeList}>
                {CUSTOMER_SIZE_OPTIONS.map((s) => {
                  const isSel = selectedSize === s.id;
                  const sStock = stockBySize[s.id as "medium" | "large"];
                  const sSoldOut = sStock?.soldOut ?? false;
                  const sCount = sStock?.count ?? null;
                  const sShowLow =
                    !sSoldOut && sCount !== null && sCount > 0 && sCount <= LOW_STOCK_THRESHOLD;
                  const sizePriceOre = previewMealPriceOre(meal.basePrice, s.priceMultiplier);
                  const sizeGrams =
                    totalGramsBase > 0 ? `${Math.round(totalGramsBase * s.macroMultiplier)}g` : null;
                  const sizeName = copy.sizeNames[s.id] ?? s.label;
                  return (
                    <Pressable
                      key={s.id}
                      disabled={sSoldOut}
                      onPress={() => setSelectedSize(s.id)}
                      style={[
                        styles.sizeRow,
                        isSel && !sSoldOut && styles.sizeRowSelected,
                        sSoldOut && styles.sizeRowSoldOut,
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSel, disabled: sSoldOut }}
                      accessibilityLabel={sSoldOut ? menuCopy.sizeSoldOut(sizeName) : sizeName}
                    >
                      <View style={styles.sizeLeft}>
                        <View style={[styles.radioOuter, isSel && !sSoldOut && styles.radioOuterSel]}>
                          {isSel && !sSoldOut ? <View style={styles.radioInner} /> : null}
                        </View>
                        <View style={styles.sizeTextWrap}>
                          <ThemedText
                            style={[styles.sizeName, sSoldOut && styles.sizeNameSoldOut]}
                          >
                            {sizeName}
                            {sizeGrams ? (
                              <ThemedText style={styles.sizeGrams}> · {sizeGrams}</ThemedText>
                            ) : null}
                          </ThemedText>
                          {sSoldOut ? (
                            <View style={[styles.pill, styles.soldOutPill]}>
                              <ThemedText style={styles.soldOutPillText}>
                                {copy.soldOut.toUpperCase()}
                              </ThemedText>
                            </View>
                          ) : sShowLow && sCount !== null ? (
                            <View style={[styles.pill, styles.lowPill]}>
                              <ThemedText style={styles.lowPillText}>
                                {menuCopy.stockLeft(sCount).toUpperCase()}
                              </ThemedText>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <ThemedText
                        style={[
                          styles.sizePrice,
                          isSel && !sSoldOut && { color: colors.accent },
                          sSoldOut && { opacity: 0.5 },
                        ]}
                      >
                        {formatPriceKr(sizePriceOre)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Ingredients ── */}
          {meal.ingredients.length > 0 && (
            <>
              <Divider />
              <SectionHead>{copy.ingredients}</SectionHead>
              <View>
                {meal.ingredients.map((ing, i) => (
                  <View
                    key={`${ing.name}-${i}`}
                    style={[
                      styles.ingredientRow,
                      i < meal.ingredients.length - 1 && styles.ingredientRowBorder,
                    ]}
                  >
                    <View style={styles.ingredientDot} />
                    <ThemedText variant="caption" style={styles.ingredientName}>
                      {ing.name}
                      {ing.amountG > 0 ? (
                        <ThemedText variant="caption" style={styles.ingredientGrams}>
                          {"  —  "}
                          {Math.round(ing.amountG * sizeDef.macroMultiplier)}g
                        </ThemedText>
                      ) : null}
                    </ThemedText>
                  </View>
                ))}
              </View>

              {/* Aggregated allergens (web shows this on the /meny card) */}
              <ThemedText variant="caption" style={styles.allergenLine}>
                {mealAllergens.length === 0
                  ? copy.noAllergens
                  : `${copy.allergensLabel}: ${mealAllergens.join(", ")}`}
              </ThemedText>

              <ThemedText variant="caption" style={styles.allergyNote}>
                {copy.allergyNote}
              </ThemedText>
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky bottom bar: quantity stepper + CTA ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing[3] }]}>
        <View style={styles.stepper}>
          <Pressable
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            style={[styles.stepperButton, quantity <= 1 && { opacity: 0.3 }]}
            accessibilityRole="button"
            accessibilityLabel="Minska antal"
          >
            <Minus size={14} color="rgba(255,255,255,0.6)" strokeWidth={2} />
          </Pressable>
          <View style={styles.stepperDivider} />
          <ThemedText style={styles.stepperValue}>{quantity}</ThemedText>
          <View style={styles.stepperDivider} />
          <Pressable
            onPress={() => setQuantity((q) => q + 1)}
            style={styles.stepperButton}
            accessibilityRole="button"
            accessibilityLabel="Öka antal"
          >
            <Plus size={14} color="rgba(255,255,255,0.6)" strokeWidth={2} />
          </Pressable>
        </View>

        <Pressable
          onPress={handleAdd}
          disabled={stockLocked}
          style={({ pressed }) => [
            styles.cta,
            stockLocked && styles.ctaLocked,
            pressed && !stockLocked && { backgroundColor: colors.accentHover },
          ]}
          accessibilityRole="button"
          accessibilityLabel={copy.add}
        >
          {allSoldOut ? (
            <ThemedText style={styles.ctaLockedText}>{menuCopy.soldOutToday}</ThemedText>
          ) : selected.soldOut ? (
            <ThemedText style={styles.ctaLockedText}>
              {copy.sizeSoldOutChoose(copy.sizeNames[effectiveSize] ?? effectiveSize)}
            </ThemedText>
          ) : (
            <>
              <ThemedText style={styles.ctaText}>
                {showLowStock && selected.count !== null
                  ? copy.addWithStock(selected.count)
                  : copy.add}
              </ThemedText>
              <ThemedText style={styles.ctaPrice}>{formatPriceKr(totalOre)}</ThemedText>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/* ── Local helpers (web: Divider / SectionHead) ── */

function Divider() {
  return <View style={styles.divider} />;
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <ThemedText style={styles.sectionHead}>{children}</ThemedText>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  backLink: { marginTop: spacing[2], marginBottom: spacing[8] },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[2],
    backgroundColor: "rgba(17,17,17,0.88)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 3,
    color: colors.textPrimary,
  },
  hero: { height: 260, backgroundColor: "#1A1A1A" },
  heroPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: 100 },
  badge: {
    position: "absolute",
    left: spacing[3],
    top: 100,
    backgroundColor: "rgba(232,101,10,0.92)",
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.2,
    color: colors.textPrimary,
  },
  content: { paddingHorizontal: spacing[5], paddingTop: spacing[4] },
  title: { fontSize: 22, fontFamily: fontFamily.bodyBold, color: colors.textPrimary, letterSpacing: -0.5 },
  description: { marginTop: 5, fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.38)" },
  compactMacroRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing[2] },
  compactMacro: { fontFamily: fontFamily.mono, fontSize: 12.5, color: "rgba(255,255,255,0.38)" },
  compactDot: { color: "rgba(255,255,255,0.3)", fontSize: 12 },
  closedNote: { marginTop: spacing[3], fontStyle: "italic", color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing[4] },
  sectionHead: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.8,
    color: colors.textMuted,
    marginBottom: spacing[3],
    textTransform: "uppercase",
  },
  macroGrid: { flexDirection: "row", gap: spacing[2] },
  macroCell: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  macroCellHi: { borderColor: "rgba(232,101,10,0.25)" },
  macroVal: { fontSize: 17, fontFamily: fontFamily.monoMedium, color: colors.textPrimary },
  macroUnit: { fontSize: 10, fontFamily: fontFamily.mono, color: "rgba(255,255,255,0.3)" },
  macroLabel: { marginTop: 4, fontSize: 9.5, letterSpacing: 0.7, color: colors.textMuted },
  sizeList: { gap: spacing[2] },
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.card,
    borderRadius: radius.btn,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  sizeRowSelected: { backgroundColor: "rgba(232,101,10,0.07)", borderColor: "rgba(232,101,10,0.4)" },
  sizeRowSoldOut: { backgroundColor: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.05)", opacity: 0.55 },
  sizeLeft: { flexDirection: "row", alignItems: "center", gap: spacing[3], flex: 1 },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSel: { borderColor: colors.accent },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  sizeTextWrap: { flexDirection: "row", alignItems: "center", gap: spacing[2], flexShrink: 1 },
  sizeName: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  sizeNameSoldOut: { textDecorationLine: "line-through" },
  sizeGrams: { fontSize: 12, fontFamily: fontFamily.body, color: "rgba(255,255,255,0.35)" },
  pill: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  soldOutPill: { backgroundColor: "rgba(232,80,80,0.14)", borderColor: "rgba(232,80,80,0.28)" },
  soldOutPillText: { fontSize: 9.5, fontFamily: fontFamily.bodyBold, letterSpacing: 0.6, color: "#ff8585" },
  lowPill: { backgroundColor: "rgba(232,160,40,0.12)", borderColor: "rgba(232,160,40,0.28)" },
  lowPillText: { fontSize: 9.5, fontFamily: fontFamily.monoMedium, letterSpacing: 0.6, color: "#ffb759" },
  sizePrice: { fontSize: 14, fontFamily: fontFamily.monoMedium, color: colors.textPrimary },
  ingredientRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], paddingVertical: 7 },
  ingredientRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  ingredientDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(232,101,10,0.7)" },
  ingredientName: { color: "rgba(255,255,255,0.6)", fontFamily: fontFamily.bodyMedium },
  ingredientGrams: { color: "rgba(255,255,255,0.25)", fontFamily: fontFamily.body, fontSize: 11.5 },
  allergenLine: { marginTop: spacing[3], color: "rgba(232,200,80,0.60)", fontSize: 11 },
  allergyNote: { marginTop: spacing[2], fontStyle: "italic", color: colors.textMuted, fontSize: 11 },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    backgroundColor: "rgba(17,17,17,0.96)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  stepperButton: { height: 46, width: 38, alignItems: "center", justifyContent: "center" },
  stepperDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.1)" },
  stepperValue: {
    width: 32,
    textAlign: "center",
    fontSize: 15,
    fontFamily: fontFamily.monoMedium,
    color: colors.textPrimary,
  },
  cta: {
    flex: 1,
    height: 46,
    borderRadius: radius.btn,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
  },
  ctaLocked: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(232,80,80,0.18)",
    justifyContent: "center",
  },
  ctaLockedText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: "rgba(255,255,255,0.55)" },
  ctaText: { fontSize: 14, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  ctaPrice: { fontSize: 14, fontFamily: fontFamily.monoMedium, color: "rgba(255,255,255,0.85)" },
});
