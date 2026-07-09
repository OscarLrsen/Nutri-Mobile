import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Gift } from "lucide-react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors, fontFamily } from "@/theme";
import type { ApiWheelSegment } from "@/services/api/rewards";

/**
 * The reward wheel — visual only, but truthful: slices are rendered from
 * GET /api/rewards/wheel with arc width PROPORTIONAL to each segment's
 * ProbabilityWeight, and the wheel lands on the slice the backend actually
 * drew (targetSegmentId from the spin response). The outcome is decided
 * server-side before the wheel ever decelerates.
 *
 * Animation: natural spin-up (ease-in) → cruise while the request is in
 * flight → long ease-out deceleration (~4.5 s) onto the drawn slice, with a
 * subtle success/light haptic at rest. No sounds (the project has no audio
 * dependency — deliberately skipped). Reduced motion settles instantly.
 */

const SIZE = 264;
const CENTER = SIZE / 2;
const RADIUS = CENTER - 8;

const SLICE_FILLS = ["rgba(255,255,255,0.05)", "rgba(232,101,10,0.10)"];

/** Decorative equal-width stand-ins while segments load (or if the wheel
 * endpoint fails) — the wheel should never render as a blank disc. No
 * labels: placeholders must not imply prizes that may not exist. */
const FALLBACK_SEGMENTS: ApiWheelSegment[] = Array.from({ length: 8 }, (_, i) => ({
  id: `fallback-${i}`,
  title: "",
  icon: "",
  probabilityWeight: 1,
  displayOrder: i,
}));

interface Slice {
  segment: ApiWheelSegment;
  /** Degrees from 12 o'clock, clockwise. */
  startDeg: number;
  sweepDeg: number;
}

/** Cumulative, weight-proportional slice layout starting at 12 o'clock. */
function buildSlices(segments: ApiWheelSegment[]): Slice[] {
  const total = segments.reduce((sum, s) => sum + Math.max(1, s.probabilityWeight), 0);
  let cursor = 0;
  return segments.map((segment) => {
    const sweepDeg = (Math.max(1, segment.probabilityWeight) / total) * 360;
    const slice = { segment, startDeg: cursor, sweepDeg };
    cursor += sweepDeg;
    return slice;
  });
}

function polar(deg: number, r: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180; // -90: 0° is 12 o'clock
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

function arcPath(startDeg: number, sweepDeg: number): string {
  const p1 = polar(startDeg, RADIUS);
  const p2 = polar(startDeg + sweepDeg, RADIUS);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${p1.x} ${p1.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

/** Truncate long titles so radial labels stay inside the slice. */
function sliceLabel(title: string): string {
  return title.length > 14 ? `${title.slice(0, 13)}…` : title;
}

export function RewardWheel({
  segments,
  spinning,
  targetSegmentId,
  onSettled,
}: {
  /** Real wheel segments (GET /api/rewards/wheel); empty while loading. */
  segments: ApiWheelSegment[];
  /** True from Spin press until the API response landed. */
  spinning: boolean;
  /** The backend-drawn segment to land on (null → random landing). */
  targetSegmentId: string | null;
  /** Fired once the deceleration animation has come to rest. */
  onSettled?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const everSpun = useRef(false);

  const slices = useMemo(
    () => buildSlices(segments.length > 0 ? segments : FALLBACK_SEGMENTS),
    [segments]
  );

  useEffect(() => {
    if (spinning) {
      everSpun.current = true;
      if (reducedMotion) return; // Settle instantly on stop instead.
      // Natural spin-up, then steady cruise while the backend decides.
      rotation.value = withSequence(
        withTiming(rotation.value + 240, { duration: 700, easing: Easing.in(Easing.quad) }),
        withRepeat(
          withTiming(rotation.value + 240 + 360, { duration: 480, easing: Easing.linear }),
          -1
        )
      );
      return;
    }

    if (!everSpun.current) return; // Initial mount — nothing to settle.

    cancelAnimation(rotation);

    // Land the drawn slice's bisector under the 12-o'clock pointer, with a
    // little in-slice jitter so repeated wins don't look mechanical.
    const target = slices.find((s) => s.segment.id === targetSegmentId);
    let landingDeg = Math.random() * 360;
    if (target) {
      const jitter = (Math.random() - 0.5) * target.sweepDeg * 0.5;
      const bisector = target.startDeg + target.sweepDeg / 2 + jitter;
      // Rotating the wheel by R puts local angle A at screen angle A + R;
      // the pointer reads local angle -R (mod 360) — so R = 360 - bisector.
      landingDeg = (360 - bisector) % 360;
    }

    const settle = onSettled;
    const settleWithHaptic = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      settle?.();
    };

    if (reducedMotion) {
      rotation.value = landingDeg;
      settleWithHaptic();
      return;
    }

    // Long, satisfying deceleration: at least 4 extra full turns.
    const current = rotation.value;
    const finalRotation = Math.ceil(current / 360) * 360 + 4 * 360 + landingDeg;
    rotation.value = withTiming(
      finalRotation,
      { duration: 4500, easing: Easing.out(Easing.poly(4)) },
      (finished) => {
        if (finished) runOnJS(settleWithHaptic)();
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rotation is a stable shared value; slices/target are read at stop-time only
  }, [spinning, reducedMotion]);

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.wrap} accessibilityLabel="Belöningshjul" accessibilityRole="image">
      {/* Pointer */}
      <View style={styles.pointer} />

      <Animated.View style={wheelStyle}>
        <Svg width={SIZE} height={SIZE}>
          <G>
            {slices.map((slice, i) => (
              <Path
                key={slice.segment.id}
                d={
                  slices.length === 1
                    ? // A single segment is the whole disc — arcs degenerate.
                      `M ${CENTER} ${CENTER} m 0 ${-RADIUS} a ${RADIUS} ${RADIUS} 0 1 1 0 ${2 * RADIUS} a ${RADIUS} ${RADIUS} 0 1 1 0 ${-2 * RADIUS}`
                    : arcPath(slice.startDeg, slice.sweepDeg)
                }
                fill={SLICE_FILLS[i % SLICE_FILLS.length]}
                stroke="rgba(255,255,255,0.09)"
                strokeWidth={1}
              />
            ))}

            {/* Icon + label along each slice bisector */}
            {slices.map((slice, i) => {
              const mid = slice.startDeg + slice.sweepDeg / 2;
              const iconPos = polar(mid, RADIUS * 0.56);
              if (!slice.segment.icon && !slice.segment.title) {
                // Fallback slice — a muted dot instead of icon/label.
                return (
                  <Circle
                    key={`label-${slice.segment.id}`}
                    cx={iconPos.x}
                    cy={iconPos.y}
                    r={3}
                    fill={i % 2 === 0 ? "rgba(255,255,255,0.22)" : "rgba(232,101,10,0.55)"}
                  />
                );
              }
              const labelPos = polar(mid, RADIUS * 0.8);
              // Keep labels upright-ish: flip text on the lower half.
              const flip = mid > 90 && mid < 270;
              const labelRotation = flip ? mid + 180 : mid;
              return (
                <G key={`label-${slice.segment.id}`}>
                  <SvgText
                    x={iconPos.x}
                    y={iconPos.y}
                    fontSize={slice.sweepDeg < 45 ? 14 : 18}
                    textAnchor="middle"
                    alignmentBaseline="central"
                  >
                    {slice.segment.icon}
                  </SvgText>
                  {slice.sweepDeg >= 28 ? (
                    <SvgText
                      x={labelPos.x}
                      y={labelPos.y}
                      fontSize={8.5}
                      fontFamily={fontFamily.bodySemibold}
                      fill="rgba(255,255,255,0.65)"
                      textAnchor="middle"
                      alignmentBaseline="central"
                      transform={`rotate(${labelRotation} ${labelPos.x} ${labelPos.y})`}
                    >
                      {sliceLabel(slice.segment.title)}
                    </SvgText>
                  ) : null}
                </G>
              );
            })}

            {/* Outer ring */}
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={1.5}
            />
          </G>
        </Svg>
      </Animated.View>

      {/* Static center hub */}
      <View style={styles.hub}>
        <Gift size={22} color={colors.accent} strokeWidth={1.75} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  pointer: {
    position: "absolute",
    top: -3,
    zIndex: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.accent,
  },
  hub: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.28)",
  },
});
