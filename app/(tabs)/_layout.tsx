import { Tabs } from "expo-router";
import { House, UtensilsCrossed, ShoppingCart, User } from "lucide-react-native";

import { colors } from "@/theme";

/**
 * Bottom tabs: Hem / Meny / Varukorg / Mina sidor.
 *
 * Hem mirrors the web app's landing (HeroMobile.tsx); the web's hamburger
 * menu has no tab equivalent — its destinations (hitta oss, hur funkar det,
 * inställningar, …) will live under Mina sidor or the Hem screen in later
 * features. Meny/Varukorg/Mina sidor are still placeholders (features 2–5).
 */
export default function TabsLayout() {
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
          title: "Hem",
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="meny"
        options={{
          title: "Meny",
          tabBarIcon: ({ color, size }) => <UtensilsCrossed color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="varukorg"
        options={{
          title: "Varukorg",
          tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="konto"
        options={{
          title: "Mina sidor",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
