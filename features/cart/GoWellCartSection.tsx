import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Check } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useCart } from "@/context/CartContext";
import { useIncludedDrink } from "@/context/IncludedDrinkContext";
import { getDrinks, type ApiDrink } from "@/services/api/drinks";
import { getStoreStatus } from "@/services/api/store";
import {
  getGoWellVisual,
  goWellFlavorLabel,
  isDrinkInStock,
} from "@/features/menu/goWellFlavors";
import { GoWellFlavorList } from "@/features/menu/GoWellFlavorList";
import type { CartItem } from "@/types/cart";
import { formatPriceKr } from "@/utils/money";
import { useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * GoWell in the cart (patch 17B) — the only place the drink can actually
 * become included.
 *
 * Three things must all be true, and the SERVER owns the first: the lunch
 * window is open, the cart holds a qualifying meal, and a flavour is in
 * stock. The device clock is never consulted; the window flag is polled with
 * the store status every 30 seconds, which means it can close while the cart
 * sits open — that transition is handled explicitly rather than left to
 * surprise the customer at checkout.
 */

/** Same rule the backend enforces, read from the cart's own item kind rather
 * than by matching names: meals and custom meals qualify, drinks do not. */
export function isQualifyingMealItem(item: CartItem): boolean {
  return item.kind !== "drink" && item.quantity > 0;
}

export function GoWellCartSection() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { items, addDrinkItem } = useCart();
  const { selection, select, decline, reset } = useIncludedDrink();
  const [expanded, setExpanded] = useState(false);

  const storeStatus = useQuery({
    queryKey: ["store", "status"],
    queryFn: getStoreStatus,
    refetchInterval: 30_000,
  }).data;

  const drinksQuery = useQuery({ queryKey: ["drinks"], queryFn: getDrinks });

  const goWellDrinks = useMemo(
    () => (drinksQuery.data ?? []).filter((d) => d.isGoWell === true),
    [drinksQuery.data]
  );
  const inStockDrinks = useMemo(() => goWellDrinks.filter(isDrinkInStock), [goWellDrinks]);

  const windowOpen = storeStatus?.includedDrinkWindowOpen === true;
  const hasQualifyingMeal = items.some(isQualifyingMealItem);
  const canInclude = windowOpen && hasQualifyingMeal && inStockDrinks.length > 0;

  /* ── Transitions the customer needs told about ────────────────── */

  // Remember what was true so a change can be explained, rather than the
  // offer just vanishing between one render and the next.
  const hadIncludableState = useRef(false);
  const [lostReason, setLostReason] = useState<"meal-removed" | "window-closed" | null>(null);

  useEffect(() => {
    const wasIncludable = hadIncludableState.current;
    hadIncludableState.current = windowOpen && hasQualifyingMeal;

    if (!wasIncludable) return;
    if (!windowOpen) setLostReason("window-closed");
    else if (!hasQualifyingMeal) setLostReason("meal-removed");
  }, [windowOpen, hasQualifyingMeal]);

  // The drink line itself is NEVER removed — it simply becomes a paid drink,
  // with the cart and its quantity intact.
  useEffect(() => {
    if (!canInclude && selection.type === "selected") reset();
  }, [canInclude, selection.type, reset]);

  // A flavour that sold out while selected cannot stay selected.
  useEffect(() => {
    if (selection.type !== "selected") return;
    const drink = goWellDrinks.find((d) => d.id === selection.drinkId);
    if (drink && !isDrinkInStock(drink)) reset();
  }, [goWellDrinks, selection, reset]);

  const selectedDrink =
    selection.type === "selected"
      ? goWellDrinks.find((d) => d.id === selection.drinkId) ?? null
      : null;
  const selectedItem =
    selection.type === "selected"
      ? items.find((i) => i.clientLineId === selection.clientLineId) ?? null
      : null;

  /* ── Choosing a flavour ──────────────────────────────────────── */

  function chooseFlavour(drink: ApiDrink) {
    // Reuse the line if this flavour is already in the cart — a second,
    // duplicate "included" line would make the reward ambiguous and leave the
    // customer with two bottles on the ticket.
    const existing = items.find((i) => i.kind === "drink" && i.drink?.id === drink.id);
    if (existing?.clientLineId) {
      select(drink.id, existing.clientLineId);
      setExpanded(false);
      return;
    }

    // Not in the cart yet: add it, then pick up the line the cart just
    // created. Resolved in an effect below, because the new id only exists
    // after the state update lands.
    addDrinkItem(drink);
    setPendingDrinkId(drink.id);
    setExpanded(false);
  }

  const [pendingDrinkId, setPendingDrinkId] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingDrinkId) return;
    const line = items.find((i) => i.kind === "drink" && i.drink?.id === pendingDrinkId);
    if (line?.clientLineId) {
      select(pendingDrinkId, line.clientLineId);
      setPendingDrinkId(null);
    }
  }, [items, pendingDrinkId, select]);

  /* ── Nothing to show ─────────────────────────────────────────── */

  if (goWellDrinks.length === 0) return null;

  const priceLabel = (drink: ApiDrink | null) =>
    drink ? formatPriceKr(drink.priceOre, language) : "";

  /* ── Included mode ───────────────────────────────────────────── */

  if (canInclude) {
    if (selection.type === "selected" && selectedDrink && selectedItem) {
      const visual = getGoWellVisual(selectedDrink);
      return (
        <View style={styles.card}>
          <Header title={t("goWell.includedTitle")} />
          <View style={styles.summary}>
            <View style={[styles.summaryImageWrap, { backgroundColor: visual.soft }]}>
              <Image
                source={selectedDrink.image || undefined}
                style={styles.summaryImage}
                contentFit="contain"
                accessibilityLabel={goWellFlavorLabel(selectedDrink, language)}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText style={styles.summaryName}>
                {goWellFlavorLabel(selectedDrink, language)}
              </ThemedText>
              <View style={styles.summaryStateRow}>
                <Check size={13} color={visual.accent} strokeWidth={3} />
                <ThemedText style={[styles.summaryState, { color: visual.accent }]}>
                  {t("goWell.includedZero")}
                </ThemedText>
              </View>
            </View>
            {/* No quantity stepper here: exactly one portion is included, and
                the line's own quantity stays editable on the order row. */}
            <Pressable
              onPress={() => setExpanded(true)}
              style={styles.linkButton}
              accessibilityRole="button"
              accessibilityLabel={t("goWell.changeFlavour")}
              hitSlop={6}
            >
              <ThemedText style={styles.linkLabel}>{t("goWell.changeFlavour")}</ThemedText>
            </Pressable>
          </View>

          {expanded ? (
            <GoWellFlavorList
              drinks={inStockDrinks}
              mode="included"
              selectedDrinkId={selectedDrink.id}
              onSelect={chooseFlavour}
            />
          ) : null}
        </View>
      );
    }

    // Declined — keep it quiet but reversible right up to submit.
    if (selection.type === "declined") {
      return (
        <View style={styles.card}>
          <Header title={t("goWell.includedTitle")} />
          <ThemedText style={styles.body}>{t("goWell.declinedBody")}</ThemedText>
          <Pressable
            onPress={reset}
            style={styles.linkButton}
            accessibilityRole="button"
            accessibilityLabel={t("goWell.chooseAfterAll")}
          >
            <ThemedText style={styles.linkLabel}>{t("goWell.chooseAfterAll")}</ThemedText>
          </Pressable>
        </View>
      );
    }

    // Undecided. No flavour is preselected — the customer must choose.
    return (
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Header title={t("goWell.includedTitle")} />
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>{t("goWell.choiceRequired")}</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.body}>{t("goWell.chooseToFinish")}</ThemedText>
        <ThemedText style={styles.fineprint}>{t("goWell.onePerOrder")}</ThemedText>

        <GoWellFlavorList drinks={inStockDrinks} mode="included" onSelect={chooseFlavour} />

        {/* The drink is included, but it must never become a checkout block. */}
        <Pressable
          onPress={decline}
          style={styles.linkButton}
          accessibilityRole="button"
          accessibilityLabel={t("goWell.continueWithout")}
        >
          <ThemedText style={styles.linkLabelSubtle}>{t("goWell.continueWithout")}</ThemedText>
        </Pressable>
      </View>
    );
  }

  /* ── Paid mode ───────────────────────────────────────────────── */

  const anyInStock = inStockDrinks.length > 0;

  return (
    <View style={styles.card}>
      <Header title={t("goWell.addTitle")} />

      {/* Why the offer went away, said once and plainly. The cart, the line
          and its quantity are all untouched. */}
      {lostReason === "window-closed" ? (
        <ThemedText style={styles.notice}>
          {t("goWell.windowClosedNotice", { price: priceLabel(selectedDrink ?? inStockDrinks[0] ?? goWellDrinks[0]) })}
        </ThemedText>
      ) : lostReason === "meal-removed" ? (
        <ThemedText style={styles.notice}>
          {t("goWell.mealRemovedNotice", { price: priceLabel(selectedDrink ?? inStockDrinks[0] ?? goWellDrinks[0]) })}
        </ThemedText>
      ) : null}

      {!anyInStock ? (
        <ThemedText style={styles.body}>{t("goWell.allSoldOut")}</ThemedText>
      ) : (
        <GoWellFlavorList
          drinks={goWellDrinks}
          mode="paid"
          onSelect={(drink) => addDrinkItem(drink)}
        />
      )}
    </View>
  );
}

function Header({ title }: { title: string }) {
  return (
    <ThemedText accessibilityRole="header" style={styles.title}>
      {title}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    gap: spacing[2],
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  title: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.textPrimary,
  },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: radius.chip,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 9.5,
    letterSpacing: 0.5,
    fontFamily: fontFamily.headlineSemibold,
    color: colors.bg,
  },
  body: { fontSize: 12.5, lineHeight: 17.5, color: colors.textSecondary },
  fineprint: { fontSize: 11.5, lineHeight: 16, color: colors.textTertiary },
  notice: { fontSize: 12.5, lineHeight: 17.5, color: colors.textPrimary },
  summary: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  summaryImageWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.btn,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  summaryImage: { width: "70%", height: "80%" },
  summaryName: { fontSize: 14, fontFamily: fontFamily.headlineSemibold, color: colors.textPrimary },
  summaryStateRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  summaryState: { fontSize: 12.5, fontFamily: fontFamily.headlineSemibold },
  linkButton: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  linkLabel: { fontSize: 13, fontFamily: fontFamily.headlineSemibold, color: colors.accent },
  linkLabelSubtle: { fontSize: 13, fontFamily: fontFamily.headlineSemibold, color: colors.textSecondary },
});
