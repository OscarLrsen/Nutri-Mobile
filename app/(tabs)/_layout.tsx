import { Tabs } from "expo-router";
import { House, UtensilsCrossed, ShoppingCart, User } from "lucide-react-native";

import { useCart } from "@/context/CartContext";
import { useTranslation } from "@/i18n";
import { colors, fontFamily } from "@/theme";

/**
 * Bottom tabs: Hem / Meny / Varukorg / Mina sidor.
 *
 * Hem mirrors the web app's landing (HeroMobile.tsx); the web's hamburger
 * menu has no tab equivalent — its destinations (hitta oss, hur funkar det,
 * inställningar, …) will live under Mina sidor or the Hem screen in later
 * features. Mina sidor is still a placeholder (feature 5+).
 *
 * The Varukorg tab shows a live item-count badge (the mobile equivalent of
 * the web's cart-count bubble in the navbar/BottomNav), driven by the same
 * totalItems the web CartContext exposes — updates instantly on add/remove.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { totalItems } = useCart();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.headerBg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("common.tabHome"),
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="meny"
        options={{
          title: t("common.tabMenu"),
          tabBarIcon: ({ color, size }) => <UtensilsCrossed color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="varukorg"
        options={{
          title: t("common.tabCart"),
          tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} />,
          tabBarBadge: totalItems > 0 ? totalItems : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            color: colors.textPrimary,
            fontFamily: fontFamily.bodySemibold,
            fontSize: 11,
          },
        }}
      />
      <Tabs.Screen
        name="konto"
        options={{
          title: t("common.tabAccount"),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
