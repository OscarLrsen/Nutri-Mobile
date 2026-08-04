import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
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
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useTranslation } from "@/i18n";
import { colors, fontFamily } from "@/theme";
import type { ApiWheelSegment } from "@/services/api/rewards";

import { isUltraRarePrize, wheelSharePercent } from "./rarity";
import {
  UltraRareJackpotFill,
  type UltraRareJackpotSlice,
} from "./UltraRareJackpotFill";

/**
 * The reward wheel is visual only. Segment widths mirror the backend's
 * probability weights, while targetSegmentId is the already-drawn server
 * result. The client never chooses or changes the reward.
 */

const DEFAULT_SIZE = 288;
const SEGMENT_GRADIENTS = [
  ["#FF9A43", "#C54806"],
  ["#793519", "#351812"],
  ["#F7B85B", "#D9620B"],
  ["#63301F", "#261612"],
] as const;

const FALLBACK_SEGMENTS: ApiWheelSegment[] = Array.from({ length: 8 }, (_, i) => ({
  id: `fallback-${i}`,
  title: "",
  icon: "",
  probabilityWeight: 1,
  displayOrder: i,
}));

const SPARKLES = [
  { x: 7, y: 18, size: 5 },
  { x: 91, y: 21, size: 4 },
  { x: 3, y: 58, size: 3 },
  { x: 96, y: 63, size: 5 },
  { x: 17, y: 91, size: 4 },
  { x: 82, y: 93, size: 3 },
] as const;

interface Slice {
  segment: ApiWheelSegment;
  /** Degrees from 12 o'clock, clockwise. */
  startDeg: number;
  sweepDeg: number;
  /** Share < 5 % — gold premium treatment, preview content hidden. The
   * post-spin result still reveals the actual prize (server-drawn). */
  ultraRare: boolean;
}

function buildSlices(segments: ApiWheelSegment[]): Slice[] {
  const total = segments.reduce((sum, segment) => sum + Math.max(1, segment.probabilityWeight), 0);
  const rawTotal = segments.reduce((sum, segment) => sum + Math.max(0, segment.probabilityWeight), 0);
  let cursor = 0;
  return segments.map((segment) => {
    const sweepDeg = (Math.max(1, segment.probabilityWeight) / total) * 360;
    const slice = {
      segment,
      startDeg: cursor,
      sweepDeg,
      ultraRare: isUltraRarePrize(wheelSharePercent(segment.probabilityWeight, rawTotal)),
    };
    cursor += sweepDeg;
    return slice;
  });
}

function polar(deg: number, radius: number, center: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: center + radius * Math.cos(rad), y: center + radius * Math.sin(rad) };
}

function arcPath(startDeg: number, sweepDeg: number, radius: number, center: number): string {
  const p1 = polar(startDeg, radius, center);
  const p2 = polar(startDeg + sweepDeg, radius, center);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  return `M ${center} ${center} L ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

/**
 * Full prize titles are always shown — never truncated with an ellipsis.
 * A title that does not fit on one line is balanced onto two lines (split
 * at the space that minimises the longer line); a single overlong word
 * stays on one line and the font scales down instead.
 */
export function splitLabelLines(title: string): string[] {
  const trimmed = title.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 13) return [trimmed];
  const words = trimmed.split(" ");
  if (words.length === 1) return [trimmed];
  let bestSplit = 1;
  let bestLongest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const longest = Math.max(
      words.slice(0, i).join(" ").length,
      words.slice(i).join(" ").length
    );
    if (longest < bestLongest) {
      bestLongest = longest;
      bestSplit = i;
    }
  }
  return [words.slice(0, bestSplit).join(" "), words.slice(bestSplit).join(" ")];
}

/** ~13 characters fit at the base size (the old truncation width); longer
 * lines shrink the font proportionally instead of losing characters. */
export function labelFontSize(baseSize: number, lines: string[]): number {
  const longest = Math.max(...lines.map((line) => line.length));
  if (longest <= 13) return baseSize;
  return Math.max(6, Math.round(((baseSize * 13) / longest) * 10) / 10);
}

export function RewardWheel({
  segments,
  spinning,
  active,
  targetSegmentId,
  size = DEFAULT_SIZE,
  onSettled,
}: {
  segments: ApiWheelSegment[];
  spinning: boolean;
  /** Enables the restrained idle glow when a spin is available. */
  active: boolean;
  targetSegmentId: string | null;
  size?: number;
  onSettled?: () => void;
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const wheelScale = useSharedValue(1);
  const glowEnergy = useSharedValue(active && !reducedMotion ? 0.45 : 0.18);
  const sparkleEnergy = useSharedValue(0);
  const sparkleRotation = useSharedValue(0);
  const impact = useSharedValue(1);
  const everSpun = useRef(false);
  const settledForSpin = useRef(false);
  const mounted = useRef(true);
  const onSettledRef = useRef(onSettled);
  const [celebrating, setCelebrating] = useState(false);

  const center = size / 2;
  const radius = center - 13;
  const slices = useMemo(
    () => buildSlices(segments.length > 0 ? segments : FALLBACK_SEGMENTS),
    [segments]
  );
  const slicePaths = useMemo(
    () =>
      slices.map((slice) =>
        slices.length === 1
          ? `M ${center} ${center} m 0 ${-radius} a ${radius} ${radius} 0 1 1 0 ${2 * radius} a ${radius} ${radius} 0 1 1 0 ${-2 * radius}`
          : arcPath(slice.startDeg, slice.sweepDeg, radius, center)
      ),
    [center, radius, slices]
  );
  const ultraRareSlices = useMemo<UltraRareJackpotSlice[]>(
    () =>
      slices.flatMap((slice, index) =>
        slice.ultraRare
          ? [{
              id: slice.segment.id,
              path: slicePaths[index],
              startDeg: slice.startDeg,
              sweepDeg: slice.sweepDeg,
            }]
          : []
      ),
    [slicePaths, slices]
  );
  const winningSlice = slices.find((slice) => slice.segment.id === targetSegmentId);

  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimation(rotation);
      cancelAnimation(wheelScale);
      cancelAnimation(glowEnergy);
      cancelAnimation(sparkleEnergy);
      cancelAnimation(sparkleRotation);
      cancelAnimation(impact);
    };
  }, [glowEnergy, impact, rotation, sparkleEnergy, sparkleRotation, wheelScale]);

  const notifySettled = useCallback(() => {
    if (!mounted.current || settledForSpin.current) return;
    settledForSpin.current = true;
    onSettledRef.current?.();
  }, []);

  const showImpact = useCallback(() => {
    if (!mounted.current) return;
    setCelebrating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    if (reducedMotion) {
      impact.value = withTiming(1, { duration: 120 }, (finished) => {
        if (finished) runOnJS(notifySettled)();
      });
      return;
    }

    impact.value = withSequence(
      withTiming(1.075, { duration: 90, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 11, stiffness: 220, mass: 0.65 }, (finished) => {
        if (finished) runOnJS(notifySettled)();
      })
    );
  }, [impact, notifySettled, reducedMotion]);

  useEffect(() => {
    cancelAnimation(glowEnergy);
    if (!active || reducedMotion || spinning) {
      glowEnergy.value = withTiming(spinning && !reducedMotion ? 1 : 0.18, { duration: 220 });
      return;
    }
    glowEnergy.value = withRepeat(
      withSequence(
        withTiming(0.82, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 1600, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
  }, [active, glowEnergy, reducedMotion, spinning]);

  useEffect(() => {
    if (spinning) {
      everSpun.current = true;
      settledForSpin.current = false;
      setCelebrating(false);
      cancelAnimation(impact);
      impact.value = 1;

      if (reducedMotion) {
        wheelScale.value = withTiming(1.015, { duration: 120 });
        return;
      }

      wheelScale.value = withSequence(
        withTiming(1.07, { duration: 230, easing: Easing.out(Easing.cubic) }),
        withTiming(1.035, { duration: 300, easing: Easing.inOut(Easing.quad) })
      );
      sparkleEnergy.value = withTiming(1, { duration: 300 });
      sparkleRotation.value = withRepeat(
        withTiming(360, { duration: 5000, easing: Easing.linear }),
        -1
      );

      const start = rotation.value;
      rotation.value = withSequence(
        withTiming(start + 170, { duration: 520, easing: Easing.in(Easing.cubic) }),
        withTiming(start + 170 + 1080, { duration: 1050, easing: Easing.linear }),
        // The 360-degree repeat seam is visually identical, so cruise can
        // continue for any backend latency without a visible jump.
        withRepeat(
          withTiming(start + 170 + 1080 + 360, { duration: 410, easing: Easing.linear }),
          -1
        )
      );
      return;
    }

    if (!everSpun.current) return;

    cancelAnimation(rotation);
    cancelAnimation(sparkleRotation);
    sparkleEnergy.value = withTiming(0.12, { duration: reducedMotion ? 80 : 900 });

    // Put the centre of the server-selected slice under the fixed pointer.
    // No client-side randomness is involved in selecting the winning slice.
    const landingDeg = winningSlice
      ? (360 - (winningSlice.startDeg + winningSlice.sweepDeg / 2)) % 360
      : ((rotation.value % 360) + 360) % 360;

    if (reducedMotion) {
      rotation.value = landingDeg;
      wheelScale.value = withTiming(1, { duration: 100 });
      showImpact();
      return;
    }

    const current = rotation.value;
    const finalRotation = Math.ceil(current / 360) * 360 + 5 * 360 + landingDeg;
    rotation.value = withTiming(
      finalRotation,
      { duration: 4300, easing: Easing.out(Easing.poly(5)) },
      (finished) => {
        if (finished) runOnJS(showImpact)();
      }
    );
    wheelScale.value = withSequence(
      withTiming(1.045, { duration: 900, easing: Easing.out(Easing.quad) }),
      withTiming(1.015, { duration: 3200, easing: Easing.inOut(Easing.quad) })
    );
    // winningSlice is intentionally read only when spinning changes: the
    // response updates targetSegmentId in the same render that stops cruise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, reducedMotion]);

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ scale: wheelScale.value * impact.value }, { rotate: `${rotation.value}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.22 + glowEnergy.value * 0.48,
    transform: [{ scale: 0.94 + glowEnergy.value * 0.1 }],
  }));
  const sparklesStyle = useAnimatedStyle(() => ({
    opacity: sparkleEnergy.value,
    transform: [{ rotate: `${sparkleRotation.value}deg` }],
  }));
  const hubStyle = useAnimatedStyle(() => ({
    transform: [{ scale: impact.value }],
  }));

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityLabel={t("rewards.wheelAria")}
      accessibilityRole="image"
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          { width: size - 18, height: size - 18, borderRadius: (size - 18) / 2 },
          glowStyle,
        ]}
      />

      {!reducedMotion ? (
        <Animated.View pointerEvents="none" style={[styles.sparkleField, sparklesStyle]}>
          {SPARKLES.map((sparkle, index) => (
            <View
              key={`${sparkle.x}-${sparkle.y}`}
              style={[
                styles.sparkle,
                {
                  left: `${sparkle.x}%`,
                  top: `${sparkle.y}%`,
                  width: sparkle.size,
                  height: sparkle.size,
                  opacity: index % 2 === 0 ? 0.95 : 0.58,
                  transform: [{ rotate: "45deg" }],
                },
              ]}
            />
          ))}
        </Animated.View>
      ) : null}

      <View
        style={[
          styles.outerFrame,
          {
            width: size,
            height: size,
            borderRadius: center,
          },
          !active && styles.outerFrameInactive,
        ]}
      >
        <View
          style={[
            styles.innerFrame,
            {
              width: size - 10,
              height: size - 10,
              borderRadius: (size - 10) / 2,
            },
          ]}
        />
        <Animated.View style={wheelStyle}>
          <Svg width={size} height={size}>
            <Defs>
              {SEGMENT_GRADIENTS.map(([start, end], index) => (
                <SvgLinearGradient
                  key={`gradient-${index}`}
                  id={`reward-segment-${index}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <Stop offset="0%" stopColor={start} />
                  <Stop offset="100%" stopColor={end} />
                </SvgLinearGradient>
              ))}
            </Defs>
            <G opacity={active || spinning || celebrating ? 1 : 0.62}>
              {slices.map((slice, index) => {
                if (slice.ultraRare) return null;
                const d = slicePaths[index];
                return (
                  <G key={slice.segment.id}>
                    <Path
                      d={d}
                      fill={`url(#reward-segment-${index % SEGMENT_GRADIENTS.length})`}
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth={1.2}
                    />
                  </G>
                );
              })}
              <UltraRareJackpotFill
                slices={ultraRareSlices}
                size={size}
                radius={radius}
                reducedMotion={reducedMotion}
              />

              {celebrating && winningSlice ? (
                <Path
                  d={
                    slices.length === 1
                      ? `M ${center} ${center} m 0 ${-radius} a ${radius} ${radius} 0 1 1 0 ${2 * radius} a ${radius} ${radius} 0 1 1 0 ${-2 * radius}`
                      : arcPath(winningSlice.startDeg, winningSlice.sweepDeg, radius, center)
                  }
                  fill="rgba(255,255,255,0.24)"
                  stroke="rgba(255,244,214,0.95)"
                  strokeWidth={2.4}
                />
              ) : null}

              {slices.map((slice, index) => {
                // Ultra-rare previews are completely content-free: no icon,
                // no star, no title, no dot, no placeholder — the gold slice
                // itself is the presentation.
                if (slice.ultraRare) return null;
                const mid = slice.startDeg + slice.sweepDeg / 2;
                const iconPos = polar(mid, radius * 0.56, center);
                if (!slice.segment.icon && !slice.segment.title) {
                  return (
                    <Circle
                      key={`label-${slice.segment.id}`}
                      cx={iconPos.x}
                      cy={iconPos.y}
                      r={3}
                      fill={index % 2 === 0 ? "rgba(255,255,255,0.5)" : "rgba(255,194,125,0.7)"}
                    />
                  );
                }
                const labelPos = polar(mid, radius * 0.79, center);
                const flip = mid > 90 && mid < 270;
                const labelRotation = flip ? mid + 180 : mid;
                const labelLines = splitLabelLines(slice.segment.title);
                const labelFont = labelFontSize(size < 270 ? 8 : 9, labelLines);
                const lineGap = labelFont + 1.5;
                return (
                  <G key={`label-${slice.segment.id}`}>
                    <SvgText
                      x={iconPos.x}
                      y={iconPos.y}
                      fontSize={slice.sweepDeg < 45 ? 15 : 20}
                      textAnchor="middle"
                      alignmentBaseline="central"
                    >
                      {slice.segment.icon}
                    </SvgText>
                    {slice.sweepDeg >= 28 ? (
                      <G transform={`rotate(${labelRotation} ${labelPos.x} ${labelPos.y})`}>
                        {labelLines.map((line, lineIndex) => (
                          <SvgText
                            key={`line-${lineIndex}`}
                            x={labelPos.x}
                            y={
                              labelPos.y +
                              (lineIndex - (labelLines.length - 1) / 2) * lineGap
                            }
                            fontSize={labelFont}
                            fontFamily={fontFamily.bodyBold}
                            fill="rgba(255,255,255,0.9)"
                            stroke="rgba(20,8,3,0.32)"
                            strokeWidth={0.35}
                            textAnchor="middle"
                            alignmentBaseline="central"
                          >
                            {line}
                          </SvgText>
                        ))}
                      </G>
                    ) : null}
                  </G>
                );
              })}

              <Circle
                cx={center}
                cy={center}
                r={radius - 2}
                fill="none"
                stroke="rgba(255,255,255,0.28)"
                strokeWidth={2}
              />
              <Path
                d={`M ${center - radius * 0.62} ${center - radius * 0.62} A ${radius * 0.88} ${radius * 0.88} 0 0 1 ${center + radius * 0.62} ${center - radius * 0.62}`}
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={3}
                strokeLinecap="round"
              />
            </G>
          </Svg>
        </Animated.View>
      </View>

      <View style={styles.pointerShadow} />
      <View style={styles.pointer}>
        <View style={styles.pointerHighlight} />
      </View>

      <Animated.View style={[styles.hubOuter, hubStyle]}>
        <View style={styles.hubInner}>
          <Gift size={23} color="#FFF3DF" strokeWidth={2.1} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  glow: {
    position: "absolute",
    backgroundColor: "rgba(232,101,10,0.46)",
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  sparkleField: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  sparkle: {
    position: "absolute",
    borderRadius: 1,
    backgroundColor: "#FFD7A1",
    shadowColor: "#FFB45B",
    shadowOpacity: 1,
    shadowRadius: 5,
  },
  outerFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#120B08",
    borderWidth: 5,
    borderColor: "#D85B08",
    shadowColor: "#F4771B",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 12,
  },
  outerFrameInactive: {
    borderColor: "#74340F",
    shadowOpacity: 0.16,
  },
  innerFrame: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(255,224,185,0.52)",
    zIndex: 2,
  },
  pointerShadow: {
    position: "absolute",
    top: -7,
    zIndex: 7,
    width: 0,
    height: 0,
    borderLeftWidth: 17,
    borderRightWidth: 17,
    borderTopWidth: 31,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "rgba(0,0,0,0.42)",
    transform: [{ translateY: 4 }],
  },
  pointer: {
    position: "absolute",
    top: -9,
    zIndex: 8,
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderTopWidth: 28,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFF1D8",
  },
  pointerHighlight: {
    position: "absolute",
    top: -25,
    left: -4,
    width: 8,
    height: 12,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  hubOuter: {
    position: "absolute",
    zIndex: 6,
    width: 70,
    height: 70,
    borderRadius: 35,
    padding: 5,
    backgroundColor: "#FF9B42",
    borderWidth: 2,
    borderColor: "#FFD4A2",
    shadowColor: "#000",
    shadowOpacity: 0.52,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
  hubInner: {
    flex: 1,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#A53C08",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
});
