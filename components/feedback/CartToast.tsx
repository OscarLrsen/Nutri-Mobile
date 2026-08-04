import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, TriangleAlert } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useCart } from "@/context/CartContext";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * The cart confirmation ("Tillagd i varukorgen"), mounted once at the app
 * root and driven by CartContext's toast state.
 *
 * ONE MECHANISM, ONE RENDERER. CartContext already tracked a cart toast but
 * nothing ever drew it, which is why adding a drink gave no feedback beyond
 * the button's own inline state. This is that missing renderer rather than a
 * second messaging system: the context stays the single source of what to
 * say, and it emits a translation KEY, so a language switch retranslates a
 * toast that is already on screen without a restart.
 *
 * Repeat adds replace rather than queue — CartContext bumps a monotonic id
 * and restarts its timer, so this component just re-runs the entrance
 * animation for the new id. Hammering the add button shows one current
 * confirmation, never a backlog.
 *
 * Dark-only, matching the rest of the app: a compact pill above the tab bar,
 * not a full-width banner.
 */
export function CartToast() {
  const { toast } = useCart();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  // Keyed on the toast id, so a replacement animates in again instead of
  // sitting there silently swapped.
  const toastId = toast?.id ?? null;

  useEffect(() => {
    if (toastId === null) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [toastId, progress]);

  if (!toast) return null;

  const isError = toast.variant === "error";

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        { bottom: insets.bottom + spacing[16] },
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        },
      ]}
    >
      <Animated.View style={[styles.pill, isError && styles.pillError]}>
        {isError ? (
          <TriangleAlert size={14} color={colors.error} strokeWidth={2.5} />
        ) : (
          <Check size={14} color={colors.accent} strokeWidth={2.5} />
        )}
        <ThemedText
          numberOfLines={2}
          style={[styles.label, isError && { color: colors.error }]}
        >
          {t(toast.messageKey, toast.params)}
        </ThemedText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: spacing[6],
    zIndex: 50,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    maxWidth: "100%",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.btn,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    // Lifts the pill off whatever it overlaps without a heavy scrim.
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pillError: {
    borderColor: "rgba(239,68,68,0.35)",
  },
  label: {
    flexShrink: 1,
    fontSize: 13.5,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.2,
    color: colors.textPrimary,
  },
});
