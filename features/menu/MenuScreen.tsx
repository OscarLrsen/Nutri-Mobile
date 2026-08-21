import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { ThemedText } from "@/components/ui/ThemedText";
import { Screen } from "@/components/ui/Screen";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { ErrorState } from "@/components/feedback/ErrorState";
import { EmptyState } from "@/components/feedback/EmptyState";
import { getMeals, getAllAvailability, type ApiMeal, type ApiMealAvailability } from "@/services/api/meals";
import { getDrinks, type ApiDrink } from "@/services/api/drinks";
import { getLocation, getStoreStatus } from "@/services/api/store";
import {
  deriveLocationStatusKind,
  getLocationStatusLabel,
  STATUS_COLORS,
} from "@/utils/locationStatus";
import { ActiveOrderBanner } from "@/features/order/ActiveOrderBanner";
import { useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { MealCard } from "./MealCard";
import { DrinkCard } from "./DrinkCard";
import { PersonalMenuSection } from "./PersonalMenuSection";
import { SlotTargetBanner } from "./SlotTargetBanner";
import { GoWellFlavorCarousel } from "./GoWellFlavorCarousel";
import {
  categoryForSlot,
  parseSlot,
  recommendSize,
  slotForCategory,
  slotTarget,
} from "./mealRecommendation";
import { BREAKFAST_WINDOW_LABEL, isBreakfastOrderable } from "./breakfastWindow";
import {
  isProfileGapError,
  useTodayDayPlanQuery,
  useTodayNutritionQuery,
} from "@/services/api/nutritionQueries";

/**
 * Meny — mobile port of the web /meny page's category/grouping logic
 * (ported 1:1 from src/app/meny/page.tsx):
 * - frukost       = meals tagged "Breakfast" (MealTimeTag enum name)
 * - huvudmaltider = meals not in category "Mellanmål" and not breakfast
 * - mellanmal     = meals in category "Mellanmål"
 * - shakes        = drinks in category "Shakes"
 * - dryck         = all other drinks
 * Drinks with zero stock are hidden entirely (web parity). Categories with
 * no items are hidden; default tab is Huvudmåltider with fallback to the
 * first non-empty category.
 *
 * Meal cards open the existing detail route and can add the currently
 * selected size through the shared CartContext. Drink cards retain their
 * dedicated addDrinkItem path.
 */

const BREAKFAST_TAG = "Breakfast";

const CATEGORY_IDS = ["frukost", "huvudmaltider", "mellanmal", "shakes", "dryck"] as const;
type CategoryId = (typeof CATEGORY_IDS)[number];

type MenuItem =
  | { kind: "meal"; meal: ApiMeal }
  | { kind: "drink"; drink: ApiDrink };

export function MenuScreen() {
  const { t } = useTranslation();
  // Store status — MOVED HERE FROM HEM (Patch 1 IA): Meny now owns the 30s
  // poll. Same ["store","status"] key as before, so CartScreen's closed
  // banner and MealDetail keep sharing this cache row. Tab screens stay
  // mounted, so the poll runs for the whole session exactly like it did on
  // the old Hem.
  const statusQuery = useQuery({
    queryKey: ["store", "status"],
    queryFn: getStoreStatus,
    refetchInterval: 30_000,
  });
  const locationQuery = useQuery({ queryKey: ["store", "location"], queryFn: getLocation });

  const mealsQuery = useQuery({ queryKey: ["meals"], queryFn: getMeals });
  const drinksQuery = useQuery({ queryKey: ["drinks"], queryFn: getDrinks });
  // Personal portion recommendations (patch 12): ONE shared nutrition
  // query for the whole menu — the same ["nutrition","today"] cache row
  // Home uses, so this usually costs zero extra network calls and NEVER
  // one per card. 404/422 = profile gap (honest CTA, no fake recs);
  // any other error = null targets → cards render without recs.
  const todayQuery = useTodayNutritionQuery();
  const profileGap = todayQuery.isError && isProfileGapError(todayQuery.error);
  // The user's SAVED day plan (one shared query, invalidated by the day
  // planner on save) — its slot targets take priority over the automatic
  // distribution, so "your goal and today's plan" is honest copy.
  const dayPlanQuery = useTodayDayPlanQuery();
  // Availability failing must never block the menu — treat as unknown and
  // let backend order-time validation be the safety net (web parity).
  const availabilityQuery = useQuery({
    queryKey: ["meals", "availability"],
    queryFn: () => getAllAvailability().catch(() => null),
    refetchInterval: 60_000,
  });

  const availabilityById = useMemo(() => {
    if (!availabilityQuery.data) return null;
    const map = new Map<string, ApiMealAvailability>();
    for (const a of availabilityQuery.data) map.set(a.mealId, a);
    return map;
  }, [availabilityQuery.data]);

  const { groups, goWellDrinks } = useMemo(() => {
    const meals = mealsQuery.data ?? [];
    const drinks = (drinksQuery.data ?? []).filter((d) => (d.stockQuantity ?? 0) > 0);
    const isBreakfast = (m: ApiMeal) => m.mealTimeTags?.includes(BREAKFAST_TAG) ?? false;
    // GoWell (patch 11): the family renders as ONE carousel at the top of
    // Dryck; its flavours are excluded from the regular card list so a
    // flavour never appears twice. Water (LOKA) and any other drink keep
    // the standard DrinkCard below the carousel.
    const nonShakeDrinks = drinks.filter((d) => d.category !== "Shakes");
    // The BACKEND flag decides, never the product name (patch 17B).
    const goWell = nonShakeDrinks.filter((d) => d.isGoWell === true);
    return {
      goWellDrinks: goWell,
      groups: {
        frukost: meals.filter(isBreakfast).map((meal): MenuItem => ({ kind: "meal", meal })),
        huvudmaltider: meals
          .filter((m) => m.category !== "Mellanmål" && !isBreakfast(m))
          .map((meal): MenuItem => ({ kind: "meal", meal })),
        mellanmal: meals
          .filter((m) => m.category === "Mellanmål")
          .map((meal): MenuItem => ({ kind: "meal", meal })),
        shakes: drinks
          .filter((d) => d.category === "Shakes")
          .map((drink): MenuItem => ({ kind: "drink", drink })),
        dryck: nonShakeDrinks
          .filter((d) => d.isGoWell !== true)
          .map((drink): MenuItem => ({ kind: "drink", drink })),
      } satisfies Record<CategoryId, MenuItem[]>,
    };
  }, [mealsQuery.data, drinksQuery.data]);

  const availableCategories = useMemo(
    // Dryck stays available when the GoWell carousel alone has content
    // (e.g. every non-shake drink is a GoWell flavour).
    () =>
      CATEGORY_IDS.filter(
        (id) => groups[id].length > 0 || (id === "dryck" && goWellDrinks.length > 0)
      ),
    [groups, goWellDrinks]
  );

  const [activeCategory, setActiveCategory] = useState<CategoryId>("huvudmaltider");

  // Header height differs per category now — reset scroll on chip switch so
  // the list never lands mid-content under a differently-sized header.
  const listRef = useRef<FlatList<MenuItem>>(null);
  const switchCategory = (id: CategoryId) => {
    setActiveCategory(id);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // Home's day-plan rows open the menu on a category. Applied through an
  // effect keyed on the param (not on mount) so tapping Frukost, going back
  // and tapping Mellanmål switches again; `navKey` distinguishes two taps on
  // the SAME slot, which would otherwise be one unchanged param and leave a
  // manual chip switch in between un-overridden.
  const params = useLocalSearchParams<{ category?: string; slot?: string; navKey?: string }>();
  const requestedCategory = params.category;
  const navKey = params.navKey;
  useEffect(() => {
    if (!requestedCategory) return;
    if ((CATEGORY_IDS as readonly string[]).includes(requestedCategory)) {
      setActiveCategory(requestedCategory as CategoryId);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [requestedCategory, navKey]);

  const activeId: CategoryId =
    availableCategories.find((id) => id === activeCategory) ??
    availableCategories[0] ??
    "huvudmaltider";
  const activeItems = groups[activeId];

  // "Din personliga meny" (patch 12) renders only under Huvudmåltider so
  // Shakes/Dryck browsing isn't pushed below the fold by planning cards.
  const showOrderingEntries = activeId === "huvudmaltider";

  // Slot target for the ACTIVE category — pure presentation of the
  // backend's per-slot distribution (see mealRecommendation.ts).
  const { language } = useLanguage();
  // A slot carried in from Home wins over the clock rule: Lunch and Middag
  // share the Huvudmåltider chip, so without it a tap on Middag at 12:00
  // would be served lunch portions. Only honoured when it actually belongs
  // to the category being shown, so a stale param cannot mismatch the list.
  const requestedSlot = parseSlot(params.slot);
  const activeSlot =
    activeId === "frukost" || activeId === "huvudmaltider" || activeId === "mellanmal"
      ? requestedSlot && categoryForSlot(requestedSlot) === activeId
        ? requestedSlot
        : slotForCategory(activeId, language)
      : null;
  const activeSlotTarget = activeSlot
    ? slotTarget(todayQuery.data, dayPlanQuery.data ?? null, activeSlot)
    : null;

  // Advisory mirror of the server's window (see breakfastWindow.ts). The
  // backend refuses the order regardless; this only avoids a dead Add button
  // that fails with an unexplained error.
  const breakfastOpen = isBreakfastOrderable(language);

  const loading = mealsQuery.isLoading || drinksQuery.isLoading;
  const error = mealsQuery.isError || drinksQuery.isError;

  // Status derivation ported verbatim from the old Hem hero (web
  // StoreStatusContext parity: unreachable/unknown status counts as closed).
  const storeStatus = statusQuery.data ?? null;
  const locationData = locationQuery.data ?? null;
  const storeLoading = statusQuery.isLoading || locationQuery.isLoading;
  const isClosed = storeStatus ? storeStatus.status === "Closed" : !storeLoading;
  const isPaused = storeStatus?.status === "Paused";
  const statusKind = deriveLocationStatusKind({
    isLoading: storeLoading,
    isClosed,
    isPaused,
    location: locationData,
  });
  const locationName =
    (locationData?.isVisible && locationData.locationName) ||
    storeStatus?.location ||
    t("hero.fallbackLocation");
  const statusLabelText = getLocationStatusLabel(statusKind, locationData?.openTime, t).toUpperCase();

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText variant="headline">{t("common.tabMenu")}</ThemedText>
        {/* PLATS · IDAG · STATUS — moved from Hem together with the poll */}
        {!storeLoading && (
          <ThemedText variant="caption" style={styles.statusText}>
            <ThemedText variant="caption" style={styles.statusText}>
              {locationName.toUpperCase()}
            </ThemedText>
            <ThemedText variant="caption" style={styles.statusDot}>
              {"  ·  "}
            </ThemedText>
            <ThemedText variant="caption" style={styles.statusText}>
              {t("hero.today")}
            </ThemedText>
            <ThemedText variant="caption" style={styles.statusDot}>
              {"  ·  "}
            </ThemedText>
            <ThemedText
              variant="caption"
              style={[styles.statusText, { color: STATUS_COLORS[statusKind] }]}
            >
              {statusLabelText}
            </ThemedText>
          </ThemedText>
        )}
        {/* Admin broadcast (publicMessage) — shown with the status it belongs to */}
        {!storeLoading && storeStatus?.publicMessage ? (
          <View style={styles.publicMessageRow}>
            <ThemedText variant="caption" style={styles.publicMessageText}>
              📢 {storeStatus.publicMessage}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {loading ? (
        <LoadingIndicator />
      ) : error ? (
        <ErrorState
          message={
            (mealsQuery.error as { message?: string })?.message ??
            (drinksQuery.error as { message?: string })?.message ??
            t("menu.loadError")
          }
          onRetry={() => {
            mealsQuery.refetch();
            drinksQuery.refetch();
            availabilityQuery.refetch();
          }}
        />
      ) : availableCategories.length === 0 ? (
        <EmptyState message={t("menu.empty")} />
      ) : (
        <>
          {/* Category chips */}
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {availableCategories.map((id) => {
                const active = id === activeId;
                return (
                  <Pressable
                    key={id}
                    onPress={() => switchCategory(id)}
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                      {t(`menu.categories.${id}`)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <FlatList
            ref={listRef}
            data={activeItems}
            keyExtractor={(item) => (item.kind === "meal" ? item.meal.id : `drink-${item.drink.id}`)}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                {/* The live order follows the customer into the menu too —
                    renders nothing without one. */}
                <ActiveOrderBanner />
                {/* "Din personliga meny" (patch 12, release-trimmed to the
                    day planner only — see PersonalMenuSection).
                    FlatList-correct header content — never a ScrollView
                    around the list. Rendered only under Huvudmåltider
                    (see showOrderingEntries). */}
                {showOrderingEntries ? (
                  <PersonalMenuSection profileGap={profileGap} />
                ) : null}
                {/* GoWell family (patch 11) — one swipeable component at
                    the top of Dryck; water/other drinks follow as
                    standard cards in the list below. */}
                {activeId === "dryck" && goWellDrinks.length > 0 ? (
                  <GoWellFlavorCarousel drinks={goWellDrinks} />
                ) : null}
                {/* The slot's TARGET — shown only when the menu was opened
                    from a day-plan row, and only for the slot that row
                    named. The menu already knew this number (it is what
                    picks M or L); it just never showed it, so the customer
                    had nothing to compare Home against except a meal card,
                    which is a different quantity entirely. */}
                {activeSlot && requestedSlot === activeSlot ? (
                  <SlotTargetBanner slot={activeSlot} target={activeSlotTarget} />
                ) : null}
                <ThemedText style={styles.sectionLabel}>
                  {t(`menu.categories.${activeId}`).toUpperCase()} ·{" "}
                  {t("menu.itemCount", {
                    count: activeItems.length + (activeId === "dryck" ? goWellDrinks.length : 0),
                  }).toUpperCase()}
                </ThemedText>
                {/* Breakfast stays BROWSABLE outside its window — the
                    customer can read the menu and plan. The banner switches
                    from "served 10–11" to "cannot be ordered now" so the
                    locked Add buttons below have a stated reason. */}
                {activeId === "frukost" ? (
                  <View
                    style={[styles.breakfastBanner, !breakfastOpen && styles.breakfastBannerClosed]}
                  >
                    <ThemedText
                      variant="caption"
                      style={[styles.breakfastText, !breakfastOpen && styles.breakfastTextClosed]}
                    >
                      {breakfastOpen
                        ? t("menu.breakfastServed")
                        : t("menu.breakfastClosed", { window: BREAKFAST_WINDOW_LABEL })}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            }
            renderItem={({ item }) =>
              item.kind === "meal" ? (
                <MealCard
                  meal={item.meal}
                  availability={availabilityById?.get(item.meal.id) ?? null}
                  recommendation={
                    activeSlot ? recommendSize(item.meal, activeSlotTarget, activeSlot) : null
                  }
                />
              ) : (
                <DrinkCard drink={item.drink} />
              )
            }
            ItemSeparatorComponent={() => <View style={{ height: spacing[3] }} />}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    gap: spacing[1],
  },
  statusText: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.2,
    color: colors.textSecondary,
  },
  statusDot: {
    color: colors.textMuted,
  },
  publicMessageRow: {
    marginTop: spacing[1],
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.18)",
    backgroundColor: "rgba(232,101,10,0.08)",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  publicMessageText: {
    color: "rgba(255,255,255,0.78)",
  },
  chipRow: {
    gap: spacing[2],
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipActive: {
    borderColor: "rgba(232,101,10,0.4)",
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    fontSize: 12.5,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textTertiary,
  },
  chipTextActive: {
    fontFamily: fontFamily.bodySemibold,
    color: colors.accent,
  },
  list: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },
  listHeader: {
    gap: spacing[2],
    paddingBottom: spacing[2],
    paddingHorizontal: spacing[1],
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  breakfastBanner: {
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.18)",
    backgroundColor: "rgba(232,101,10,0.08)",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  breakfastText: {
    color: "rgba(255,255,255,0.78)",
  },
  // Outside the window the banner drops the appetising accent tint — the
  // text carries the meaning, the colour only reinforces it.
  breakfastBannerClosed: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  breakfastTextClosed: {
    color: "rgba(255,255,255,0.62)",
  },
});
