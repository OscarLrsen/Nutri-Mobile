import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";

import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import { getRewardStatus } from "@/services/api/rewards";
import { WELCOME_PROMPTED_KEY_PREFIX } from "@/features/coupons/WelcomeCouponModal";
import { rewardsCopy as copy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Weekly-spin launch nudge — a non-blocking bottom sheet shown ONCE per app
 * launch when the signed-in user has a spin available (canSpin from
 * GET /api/rewards/status, the same cached query the header uses).
 *
 * Once-per-launch is a module-level flag by design (spec: "Do not show
 * again until next launch") — deliberately NOT persisted, unlike the
 * welcome modal's per-user AsyncStorage flag.
 *
 * First-login coordination: the welcome-coupon modal owns the first launch.
 * The nudge defers by reading the welcome modal's own prompted flag and
 * skipping any launch where it hasn't been answered yet — two sheets never
 * compete for the same moment.
 */

let shownThisLaunch = false;

/** Test hook — not used in production code. */
export function resetSpinNudgeForTests() {
  shownThisLaunch = false;
}

export function SpinNudgeSheet() {
  const router = useRouter();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [welcomeHandled, setWelcomeHandled] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["rewards", "status", user?.id ?? null],
    queryFn: getRewardStatus,
    enabled: !!user,
  });

  const userId = user?.id ?? null;

  useEffect(() => {
    setWelcomeHandled(false);
    if (!userId) return;
    let mounted = true;
    AsyncStorage.getItem(WELCOME_PROMPTED_KEY_PREFIX + userId)
      .then((flag) => {
        if (mounted) setWelcomeHandled(flag === "1");
      })
      .catch(() => {
        // Can't read the flag — err on the quiet side and skip the nudge.
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (shownThisLaunch || visible) return;
    if (!userId || !welcomeHandled) return;
    if (statusQuery.data?.canSpin !== true) return;
    shownThisLaunch = true;
    setVisible(true);
  }, [userId, welcomeHandled, statusQuery.data?.canSpin, visible]);

  if (!visible) return null;

  const dismiss = () => setVisible(false);
  const goSpin = () => {
    setVisible(false);
    router.push("/beloningar");
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss}>
      {/* Non-blocking: tapping the backdrop dismisses. */}
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityRole="button" />
        <Animated.View
          entering={SlideInDown.springify().damping(19).stiffness(160)}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <ThemedText style={styles.title}>{copy.nudgeTitle}</ThemedText>
          <ThemedText style={styles.body}>{copy.nudgeBody}</ThemedText>
          <Pressable
            onPress={goSpin}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && { backgroundColor: colors.accentHover },
            ]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.primaryButtonText}>{copy.nudgeSpin}</ThemedText>
          </Pressable>
          <Pressable
            onPress={dismiss}
            style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.secondaryButtonText}>{copy.nudgeLater}</ThemedText>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(232,101,10,0.22)",
    paddingHorizontal: spacing[6],
    paddingTop: spacing[3],
    paddingBottom: spacing[8],
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: spacing[4],
  },
  title: {
    fontSize: 17,
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
  primaryButton: {
    alignSelf: "stretch",
    height: 46,
    marginTop: spacing[5],
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  secondaryButton: {
    alignSelf: "stretch",
    height: 44,
    marginTop: spacing[2],
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 13.5,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textSecondary,
  },
});
