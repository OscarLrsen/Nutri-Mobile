import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { ThemedText } from "@/components/ui/ThemedText";
import { Screen } from "@/components/ui/Screen";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { ErrorState } from "@/components/feedback/ErrorState";
import { EmptyState } from "@/components/feedback/EmptyState";
import { getMeals, getAllAvailability, type ApiMeal, type ApiMealAvailability } from "@/services/api/meals";
import { getDrinks, type ApiDrink } from "@/services/api/drinks";
import { menuCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { MealCard } from "./MealCard";
import { DrinkCard } from "./DrinkCard";

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
 * Feature scope: browsing only — no cart, no detail navigation yet
 * (features 3–4).
 */

const BREAKFAST_TAG = "Breakfast";

const CATEGORY_IDS = ["frukost", "huvudmaltider", "mellanmal", "shakes", "dryck"] as const;
type CategoryId = (typeof CATEGORY_IDS)[number];

type MenuItem =
  | { kind: "meal"; meal: ApiMeal }
  | { kind: "drink"; drink: ApiDrink };

export function MenuScreen() {
  const mealsQuery = useQuery({ queryKey: ["meals"], queryFn: getMeals });
  const drinksQuery = useQuery({ queryKey: ["drinks"], queryFn: getDrinks });
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

  const groups = useMemo(() => {
    const meals = mealsQuery.data ?? [];
    const drinks = (drinksQuery.data ?? []).filter((d) => (d.stockQuantity ?? 0) > 0);
    const isBreakfast = (m: ApiMeal) => m.mealTimeTags?.includes(BREAKFAST_TAG) ?? false;
    return {
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
      dryck: drinks
        .filter((d) => d.category !== "Shakes")
        .map((drink): MenuItem => ({ kind: "drink", drink })),
    } satisfies Record<CategoryId, MenuItem[]>;
  }, [mealsQuery.data, drinksQuery.data]);

  const availableCategories = useMemo(
    () => CATEGORY_IDS.filter((id) => groups[id].length > 0),
    [groups]
  );

  const [activeCategory, setActiveCategory] = useState<CategoryId>("huvudmaltider");
  const activeId: CategoryId =
    availableCategories.find((id) => id === activeCategory) ??
    availableCategories[0] ??
    "huvudmaltider";
  const activeItems = groups[activeId];

  const loading = mealsQuery.isLoading || drinksQuery.isLoading;
  const error = mealsQuery.isError || drinksQuery.isError;

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText variant="headline">Meny</ThemedText>
      </View>

      {loading ? (
        <LoadingIndicator />
      ) : error ? (
        <ErrorState
          message={
            (mealsQuery.error as { message?: string })?.message ??
            (drinksQuery.error as { message?: string })?.message ??
            "Kunde inte ladda menyn."
          }
          onRetry={() => {
            mealsQuery.refetch();
            drinksQuery.refetch();
            availabilityQuery.refetch();
          }}
        />
      ) : availableCategories.length === 0 ? (
        <EmptyState message={menuCopy.empty} />
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
                    onPress={() => setActiveCategory(id)}
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                      {menuCopy.categories[id]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <FlatList
            data={activeItems}
            keyExtractor={(item) => (item.kind === "meal" ? item.meal.id : `drink-${item.drink.id}`)}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <ThemedText style={styles.sectionLabel}>
                  {menuCopy.categories[activeId].toUpperCase()} ·{" "}
                  {menuCopy.itemCount(activeItems.length).toUpperCase()}
                </ThemedText>
                {activeId === "frukost" ? (
                  <View style={styles.breakfastBanner}>
                    <ThemedText variant="caption" style={styles.breakfastText}>
                      {menuCopy.breakfastServed}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            }
            renderItem={({ item }) =>
              item.kind === "meal" ? (
                <MealCard meal={item.meal} availability={availabilityById?.get(item.meal.id) ?? null} />
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
});
