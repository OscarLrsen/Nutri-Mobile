import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles } from "lucide-react-native";
import Animated, { FadeIn, useReducedMotion, ZoomIn } from "react-native-reanimated";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiSpinResult } from "@/services/api/rewards";
import { useTranslation } from "@/i18n";
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
  const { t } = useTranslation();
  const isWin = !!result && result.resultType !== "NoReward";
  const reducedMotion = useReducedMotion();

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
      ? t("rewards.modalWinPoints", { amount: result.rewardValue ?? "" })
      : result.resultType === "Coupon"
        ? t("rewards.modalWinCoupon", { pct: result.rewardValue ?? "" })
        : t("rewards.modalNoWin");
  const body =
    result.resultType === "Points"
      ? t("rewards.modalPointsBody")
      : result.resultType === "Coupon"
        ? t("rewards.modalCouponBody")
        : t("rewards.modalNoWinBody");

  return (
    <Modal
      visible
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} style={styles.backdrop}>
        <Animated.View
          entering={reducedMotion ? undefined : ZoomIn.springify().damping(18).stiffness(180)}
          style={styles.card}
        >
          <LinearGradient
            colors={["rgba(232,101,10,0.22)", "rgba(28,28,30,0.96)", colors.card]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {isWin ? (
            <>
              <Sparkles style={styles.sparkleLeft} size={20} color="#FFC178" strokeWidth={1.8} />
              <Sparkles style={styles.sparkleRight} size={15} color="#FF9740" strokeWidth={1.8} />
            </>
          ) : null}
          <View style={styles.iconWrap}>
            <ThemedText style={styles.icon}>{result.icon || (isWin ? "🎁" : "😔")}</ThemedText>
          </View>

          <ThemedText style={styles.headline}>{headline}</ThemedText>
          <ThemedText style={styles.body}>{body}</ThemedText>

          {result.resultType === "Points" ? (
            <View style={styles.balanceChip}>
              <ThemedText style={styles.balanceText}>
                {result.pointsBalance} {t("rewards.pointsUnit")}
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
                <ThemedText style={styles.primaryButtonText}>
                  {t("rewards.modalShowRewards")}
                </ThemedText>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.secondaryButtonText}>{t("rewards.modalClose")}</ThemedText>
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
    overflow: "hidden",
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,164,81,0.35)",
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[8],
    alignItems: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  sparkleLeft: {
    position: "absolute",
    top: 28,
    left: 36,
  },
  sparkleRight: {
    position: "absolute",
    top: 70,
    right: 42,
  },
  iconWrap: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,186,121,0.38)",
    marginBottom: spacing[4],
    shadowColor: colors.accent,
    shadowOpacity: 0.38,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  icon: { fontSize: 44, lineHeight: 54 },
  headline: {
    fontSize: 21,
    lineHeight: 27,
    fontFamily: fontFamily.headline,
    letterSpacing: -0.55,
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
    height: 50,
    borderRadius: 13,
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
