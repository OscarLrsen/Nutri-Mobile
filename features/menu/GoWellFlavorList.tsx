import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import type { ApiDrink } from "@/services/api/drinks";
import { spacing } from "@/theme";

import { GoWellFlavorCard, type GoWellCardMode } from "./GoWellFlavorCard";

/**
 * The GoWell flavour rail (patch 17B), in the locked layout:
 *
 * - exactly two flavours → two equal cards side by side, no arrows and no
 *   pagination; a rail with two items and a scroll affordance would suggest
 *   there is more to see when there is not
 * - three or more → a horizontal snap list where the next flavour is visible
 *   at the edge, which is what tells the customer to keep scrolling
 *
 * Card width is derived from the actual screen so the peek is real on a small
 * iPhone rather than assumed from a fixed number.
 */
export function GoWellFlavorList({
  drinks,
  mode,
  selectedDrinkId,
  onSelect,
}: {
  drinks: ApiDrink[];
  mode: GoWellCardMode;
  selectedDrinkId?: string | null;
  onSelect: (drink: ApiDrink) => void;
}) {
  const { width: screenWidth } = useWindowDimensions();

  if (drinks.length === 0) return null;

  const horizontalPadding = spacing[4] * 2;

  if (drinks.length <= 2) {
    return (
      <View style={styles.pair}>
        {drinks.map((drink) => (
          <View key={drink.id} style={styles.pairItem}>
            <GoWellFlavorCard
              drink={drink}
              mode={mode}
              selected={selectedDrinkId === drink.id}
              onPress={onSelect}
            />
          </View>
        ))}
      </View>
    );
  }

  // 2.25 cards across: two full cards plus a quarter of the third peeking, so
  // the rail reads as scrollable without an arrow.
  const cardWidth = Math.round((screenWidth - horizontalPadding - spacing[2] * 2) / 2.25);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + spacing[2]}
      snapToAlignment="start"
      contentContainerStyle={styles.rail}
    >
      {drinks.map((drink) => (
        <GoWellFlavorCard
          key={drink.id}
          drink={drink}
          mode={mode}
          selected={selectedDrinkId === drink.id}
          width={cardWidth}
          onPress={onSelect}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: "row", gap: spacing[2] },
  pairItem: { flex: 1 },
  rail: { gap: spacing[2], paddingRight: spacing[4] },
});
