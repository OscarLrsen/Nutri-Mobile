import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, UtensilsCrossed, User, WandSparkles } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { heroCopy, homeCopy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Quick actions — the dashboard's navigation shortcuts: Meny, Nutri
 * Anpassar (login guard lives in the target screen) and Mina sidor.
 * Deliberately NOT labelled "Min profil" (Patch 1 IA decision).
 */
export function QuickActions() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <ThemedText style={styles.sectionLabel}>{homeCopy.actionsHead.toUpperCase()}</ThemedText>

      <View style={styles.list}>
        <ActionRow
          icon={<UtensilsCrossed size={17} color={colors.accent} />}
          label={heroCopy.seeMenu}
          sub={homeCopy.actionMenuSub}
          onPress={() => router.navigate("/(tabs)/meny")}
        />
        <ActionRow
          icon={<WandSparkles size={17} color={colors.accent} />}
          label={heroCopy.nutriCustomize}
          sub={homeCopy.actionAnpassarSub}
          onPress={() => router.push("/nutri-anpassar")}
        />
        <ActionRow
          icon={<User size={17} color={colors.accent} />}
          label={homeCopy.actionAccount}
          sub={homeCopy.actionAccountSub}
          onPress={() => router.navigate("/(tabs)/konto")}
          last
        />
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  sub,
  onPress,
  last = false,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <ThemedText variant="bodyMedium" style={styles.rowLabel}>
          {label}
        </ThemedText>
        <ThemedText variant="caption" style={styles.rowSub}>
          {sub}
        </ThemedText>
      </View>
      <ChevronRight size={15} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  list: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.btn,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowLabel: {
    color: colors.textPrimary,
  },
  rowSub: {
    color: colors.textTertiary,
    fontSize: 11,
  },
});
