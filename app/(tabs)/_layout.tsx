import { Tabs } from "expo-router";
import { UtensilsCrossed, ShoppingCart, User } from "lucide-react-native";

import { colors } from "@/theme";

/**
 * Bottom-tab skeleton: Meny / Varukorg / Mina sidor — mirrors the three
 * primary areas of Nutri-Frontend's customer-facing app (menu, cart,
 * account — spec §9), but with placeholder screens only. No menu data,
 * cart logic, or account/profile business logic is implemented in this
 * infrastructure phase — see each screen file for what's stubbed and why.
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
