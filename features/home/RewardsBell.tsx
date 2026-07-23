import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Gift } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useAuth } from "@/services/auth/AuthProvider";
import { getRewardStatus } from "@/services/api/rewards";
import { useTranslation } from "@/i18n";
import { colors } from "@/theme";

/**
 * Weekly-reward header entry — the gift icon top-left on Hem. Restores the
 * entry point that lived in the pre-redesign fixed header (feat/weekly-rewards
 * HomeScreen); the redesign (d5edd18) removed that header, and this puts the
 * icon back into the new logo row without touching the rest of the dashboard.
 *
 * Reuses GET /api/rewards/status through the SAME query key family as
 * RewardsSummaryCard and RewardsScreen (["rewards","status", userId]) — one
 * shared cache row per user, no duplicated reward logic. Auth-gated: signed
 * out, no request fires and the plain gift still routes to /beloningar (that
 * screen owns the login gate). The gentle float + green dot animate only while
 * a spin is actually available; reduced motion keeps the icon static and lets
 * the dot alone carry the signal, mirroring the original.
 */
const REWARD_DOT = "#4ade80";

export function RewardsBell() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();

  const statusQuery = useQuery({
    queryKey: ["rewards", "status", user?.id ?? null],
    queryFn: getRewardStatus,
    enabled: !!user,
  });
  const canSpin = statusQuery.data?.canSpin === true;

  const float = useSharedValue(0);
  useEffect(() => {
    if (!canSpin || reducedMotion) {
      float.value = withTiming(0, { duration: 200 });
      return;
    }
    float.value = withRepeat(
      withSequence(withTiming(-2.5, { duration: 1100 }), withTiming(0, { duration: 1100 })),
      -1
    );
  }, [float, canSpin, reducedMotion]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));

  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      hitSlop={8}
      onPress={() => router.push("/beloningar")}
      accessibilityRole="button"
      accessibilityLabel={canSpin ? t("home.rewardsBellAriaSpinReady") : t("home.rewardsBellAria")}
    >
      <Animated.View style={floatStyle}>
        <Gift size={22} color={canSpin ? colors.accent : colors.textPrimary} />
      </Animated.View>
      {canSpin ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  buttonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.96 }],
  },
  dot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: REWARD_DOT,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
});
