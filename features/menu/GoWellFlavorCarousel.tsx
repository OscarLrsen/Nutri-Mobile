import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { ThemedText } from "@/components/ui/ThemedText";
import { useCart } from "@/context/CartContext";
import { getStoreStatus } from "@/services/api/store";
import type { ApiDrink } from "@/services/api/drinks";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

import { GoWellFlavorList } from "./GoWellFlavorList";
import { isDrinkInStock } from "./goWellFlavors";

/**
 * The GoWell section on the menu (patch 17B).
 *
 * On the MENU, tapping a flavour is an ordinary paid add. The menu never
 * decides that a drink is included: inclusion depends on what is in the cart
 * and what the server clock says, neither of which belongs here. It does show
 * a note during the lunch window so the offer is discoverable, and that note
 * comes from the SERVER's window flag — never the device clock.
 */
export function GoWellFlavorCarousel({ drinks }: { drinks: ApiDrink[] }) {
  const { t } = useTranslation();
  const { addDrinkItem } = useCart();

  // The same shared query key Meny and the cart already poll, so this costs
  // no extra request.
  const storeStatus = useQuery({
    queryKey: ["store", "status"],
    queryFn: getStoreStatus,
    refetchInterval: 30_000,
  }).data;

  const windowOpen = storeStatus?.includedDrinkWindowOpen === true;
  const anyInStock = drinks.some(isDrinkInStock);

  if (drinks.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <ThemedText accessibilityRole="header" style={styles.title}>
          {t("goWell.title")}
        </ThemedText>
        <ThemedText style={styles.subtitle}>{t("goWell.tagline")}</ThemedText>
      </View>

      {/* Informational only. The cart is where the drink actually becomes
          included, and the server decides whether it may. */}
      {windowOpen && anyInStock ? (
        <View style={styles.windowNote} accessibilityRole="text">
          <ThemedText style={styles.windowNoteText}>{t("goWell.menuWindowNote")}</ThemedText>
        </View>
      ) : null}

      {!anyInStock ? (
        <ThemedText style={styles.soldOutAll}>{t("goWell.allSoldOut")}</ThemedText>
      ) : null}

      <GoWellFlavorList drinks={drinks} mode="paid" onSelect={(drink) => addDrinkItem(drink)} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing[2], marginBottom: spacing[4] },
  head: { gap: 2 },
  title: {
    fontSize: 16,
    fontFamily: fontFamily.headlineSemibold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  subtitle: { fontSize: 12.5, color: colors.textSecondary },
  windowNote: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.btn,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  windowNoteText: { fontSize: 12.5, lineHeight: 17, color: colors.textPrimary },
  soldOutAll: { fontSize: 12.5, color: colors.textSecondary },
});
