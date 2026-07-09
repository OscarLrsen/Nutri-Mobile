import { useEffect } from "react";
import { StyleSheet, type DimensionValue, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { radius } from "@/theme";

/**
 * Skeleton placeholder — subtle opacity pulse on a card-toned block, for
 * loading states that have a known layout (feedback/ counterpart to
 * LoadingIndicator, which is for indeterminate full-screen waits). Pulse is
 * disabled under reduced motion, matching the HomeScreen CTA convention.
 */
export function Skeleton({
  height,
  width = "100%",
  borderRadius = radius.card,
  style,
}: {
  height: number;
  width?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (reducedMotion) return;
    pulse.value = withRepeat(
      withSequence(withTiming(0.9, { duration: 700 }), withTiming(0.5, { duration: 700 })),
      -1
    );
  }, [pulse, reducedMotion]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[styles.block, { height, width, borderRadius }, pulseStyle, style]}
      accessibilityElementsHidden
    />
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: "rgba(255,255,255,0.07)",
  },
});
