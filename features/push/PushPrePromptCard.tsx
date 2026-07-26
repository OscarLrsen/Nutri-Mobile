import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Bell } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import {
  getPushPermissionStatus,
  registerCurrentDeviceForPush,
  requestPushPermission,
} from "@/services/push/pushNotifications";
import { clearOrderSuccessSignal, getOrderSuccessSignal } from "./orderSuccessSignal";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Push permission pre-prompt (patch 10) — an inline card on the order
 * status screen, shown at most ONCE, and only when ALL of these hold:
 *
 * - signed in (device registration is per-account),
 * - OS permission still "undetermined" (never re-asks after deny — that
 *   path lives in the profile's Notiser section via OS settings),
 * - THIS order is the one the cart just successfully placed (the
 *   order-success signal stamped by CartScreen carries the order id) —
 *   historical or already-running orders opened after an app update never
 *   trigger the prompt, per the launch decision that installing the patch
 *   must not surprise existing users, and the FIRST app start never shows
 *   a permission prompt.
 *
 * "Inte nu" dismisses without ever showing the system dialog, so the OS
 * one-shot prompt is preserved for a later explicit choice.
 */

/** Versioned — bump only if the prompt should be re-offered to everyone. */
export const PUSH_PREPROMPT_SEEN_KEY = "nutri_push_preprompt_v1";

export function PushPrePromptCard({ orderId }: { orderId: number | string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        if ((await AsyncStorage.getItem(PUSH_PREPROMPT_SEEN_KEY)) === "1") return;
        // Only on the order the user JUST placed from this installation.
        if ((await getOrderSuccessSignal()) !== String(orderId)) return;
        if ((await getPushPermissionStatus()) !== "undetermined") return;
        if (!cancelled) setVisible(true);
      } catch {
        // Fail-safe: any storage/permission read problem → just don't show.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, orderId]);

  if (!visible) return null;

  const markSeen = () => {
    setVisible(false);
    AsyncStorage.setItem(PUSH_PREPROMPT_SEEN_KEY, "1").catch(() => {});
    clearOrderSuccessSignal();
  };

  const enable = async () => {
    markSeen();
    const status = await requestPushPermission();
    if (status === "granted") {
      await registerCurrentDeviceForPush();
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <View style={styles.iconWrap}>
          <Bell size={16} color={colors.accent} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.title}>{t("push.preprompt.title")}</ThemedText>
          <ThemedText style={styles.body}>{t("push.preprompt.body")}</ThemedText>
        </View>
      </View>
      <View style={styles.buttonRow}>
        <Pressable
          onPress={enable}
          style={({ pressed }) => [styles.primary, pressed && { backgroundColor: colors.accentHover }]}
          accessibilityRole="button"
        >
          <ThemedText style={styles.primaryText}>{t("push.preprompt.enable")}</ThemedText>
        </Pressable>
        <Pressable
          onPress={markSeen}
          style={({ pressed }) => [styles.secondary, pressed && { backgroundColor: "rgba(255,255,255,0.1)" }]}
          accessibilityRole="button"
        >
          <ThemedText style={styles.secondaryText}>{t("push.preprompt.later")}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.25)",
    borderRadius: 12,
    padding: spacing[4],
    marginTop: spacing[3],
    gap: spacing[3],
  },
  headRow: { flexDirection: "row", gap: spacing[3], alignItems: "flex-start" },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "rgba(232,101,10,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  body: { marginTop: 3, fontSize: 12, lineHeight: 17, color: "rgba(255,255,255,0.4)" },
  buttonRow: { flexDirection: "row", gap: spacing[2] },
  primary: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontSize: 12.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  secondary: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
});
