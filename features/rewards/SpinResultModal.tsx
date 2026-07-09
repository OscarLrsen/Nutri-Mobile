import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiSpinResult } from "@/services/api/rewards";
import { rewardsCopy as copy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Post-spin result modal — shown only after the wheel has settled, with the
 * server-decided outcome. Premium-minimal: one large icon (the reward's own
 * emoji as configured by admin), a headline, a short body, and two actions.
 * Subtle ZoomIn entrance; no confetti/casino styling by design.
 */
export function SpinResultModal({
  result,
  onClose,
  onShowRewards,
}: {
  result: ApiSpinResult | null;
  onClose: () => void;
  onShowRewards: () => void;
}) {
  const isWin = !!result && result.resultType !== "NoReward";

  // Two-beat feel: the wheel's settle tick (light impact) → a success pulse
  // as the win reveals. No celebration haptic for no-win, deliberately.
  useEffect(() => {
    if (result && isWin) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [result, isWin]);

  if (!result) return null;
  const headline =
    result.resultType === "Points"
      ? copy.modalWinPoints(result.rewardValue ?? "")
      : result.resultType === "Coupon"
        ? copy.modalWinCoupon(result.rewardValue ?? "")
        : copy.modalNoWin;
  const body =
    result.resultType === "Points"
      ? copy.modalPointsBody
      : result.resultType === "Coupon"
        ? copy.modalCouponBody
        : copy.modalNoWinBody;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Animated.View entering={ZoomIn.springify().damping(18).stiffness(180)} style={styles.card}>
          <View style={styles.iconWrap}>
            <ThemedText style={styles.icon}>{result.icon || (isWin ? "🎁" : "😔")}</ThemedText>
          </View>

          <ThemedText style={styles.headline}>{headline}</ThemedText>
          <ThemedText style={styles.body}>{body}</ThemedText>

          {result.resultType === "Points" ? (
            <View style={styles.balanceChip}>
              <ThemedText style={styles.balanceText}>
                {result.pointsBalance} {copy.pointsUnit}
              </ThemedText>
            </View>
          ) : result.resultType === "Coupon" && result.coupon ? (
            <View style={styles.codeChip}>
              <ThemedText style={styles.codeText}>{result.coupon.code}</ThemedText>
            </View>
          ) : null}

          <View style={styles.buttons}>
            {isWin ? (
              <Pressable
                onPress={onShowRewards}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && { backgroundColor: colors.accentHover },
                ]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.primaryButtonText}>{copy.modalShowRewards}</ThemedText>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.secondaryButtonText}>{copy.modalClose}</ThemedText>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
    padding: spacing[6],
    alignItems: "center",
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
    marginBottom: spacing[4],
  },
  icon: { fontSize: 42, lineHeight: 52 },
  headline: {
    fontSize: 18,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
    textAlign: "center",
  },
  body: {
    marginTop: spacing[2],
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
  balanceChip: {
    marginTop: spacing[3],
    borderRadius: 999,
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    backgroundColor: "rgba(74,222,128,0.1)",
  },
  balanceText: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: "#4ade80" },
  codeChip: {
    marginTop: spacing[3],
    borderRadius: 999,
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
  },
  codeText: {
    fontSize: 12,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 0.5,
    color: colors.accent,
  },
  buttons: { alignSelf: "stretch", marginTop: spacing[5], gap: spacing[2] },
  primaryButton: {
    height: 46,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  secondaryButton: {
    height: 44,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 13.5,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textSecondary,
  },
});
