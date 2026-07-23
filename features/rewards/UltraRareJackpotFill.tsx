import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  SharedValue,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const GLITTER = [
  { angle: 0.2, radius: 0.43, size: 3.8, offset: 0.06, cycles: 1, opacity: 0.98 },
  { angle: 0.36, radius: 0.72, size: 2.1, offset: 0.39, cycles: 2, opacity: 0.7 },
  { angle: 0.52, radius: 0.86, size: 3.1, offset: 0.72, cycles: 1, opacity: 0.9 },
  { angle: 0.66, radius: 0.57, size: 4.2, offset: 0.22, cycles: 2, opacity: 1 },
  { angle: 0.79, radius: 0.76, size: 2.6, offset: 0.88, cycles: 1, opacity: 0.76 },
  { angle: 0.29, radius: 0.9, size: 1.6, offset: 0.57, cycles: 2, opacity: 0.64 },
  { angle: 0.7, radius: 0.35, size: 1.4, offset: 0.46, cycles: 1, opacity: 0.58 },
] as const;

export interface UltraRareJackpotSlice {
  id: string;
  path: string;
  startDeg: number;
  sweepDeg: number;
}

interface GlitterParticleProps {
  cx: number;
  cy: number;
  size: number;
  offset: number;
  cycles: number;
  maxOpacity: number;
  phase: SharedValue<number>;
  reducedMotion: boolean;
  round: boolean;
}

function GlitterParticle({
  cx,
  cy,
  size,
  offset,
  cycles,
  maxOpacity,
  phase,
  reducedMotion,
  round,
}: GlitterParticleProps) {
  const animatedProps = useAnimatedProps(() => {
    if (reducedMotion) return { opacity: maxOpacity * 0.72 };

    // Narrow sine peaks create short, staggered flashes without timers or
    // per-frame React work. Different offsets/cycles keep particles desynced.
    const wave = Math.max(0, Math.sin((phase.value * cycles + offset) * Math.PI * 2));
    return { opacity: 0.1 + Math.pow(wave, 10) * (maxOpacity - 0.1) };
  });

  if (round) {
    return (
      <AnimatedPath
        d={`M ${cx - size / 2} ${cy} a ${size / 2} ${size / 2} 0 1 0 ${size} 0 a ${size / 2} ${size / 2} 0 1 0 ${-size} 0`}
        fill="#FFF7CD"
        animatedProps={animatedProps}
      />
    );
  }

  // Unequal horizontal and vertical axes give the premium four-point
  // "diamond glint" silhouette rather than a generic star icon.
  return (
    <AnimatedPath
      d={`M ${cx} ${cy - size * 1.55} L ${cx + size * 0.34} ${cy - size * 0.32} L ${cx + size} ${cy} L ${cx + size * 0.34} ${cy + size * 0.32} L ${cx} ${cy + size * 1.55} L ${cx - size * 0.34} ${cy + size * 0.32} L ${cx - size} ${cy} L ${cx - size * 0.34} ${cy - size * 0.32} Z`}
      fill="#FFFBE5"
      stroke="rgba(255,215,108,0.9)"
      strokeWidth={0.35}
      animatedProps={animatedProps}
    />
  );
}

function polar(deg: number, radius: number, center: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: center + radius * Math.cos(rad), y: center + radius * Math.sin(rad) };
}

export function UltraRareJackpotFill({
  slices,
  size,
  radius,
  reducedMotion,
}: {
  slices: UltraRareJackpotSlice[];
  size: number;
  radius: number;
  reducedMotion: boolean;
}) {
  const center = size / 2;
  const phase = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(phase);
    phase.value = 0;
    if (!reducedMotion && slices.length > 0) {
      phase.value = withRepeat(
        withTiming(1, { duration: 4600, easing: Easing.linear }),
        -1,
        false
      );
    }
    return () => cancelAnimation(phase);
  }, [phase, reducedMotion, slices.length]);

  const glossProps = useAnimatedProps(() => ({
    x: reducedMotion ? -size * 0.08 : interpolate(phase.value, [0, 1], [-size * 0.8, size * 1.5]),
  }));
  const glowProps = useAnimatedProps(() => ({
    opacity: reducedMotion
      ? 0.52
      : interpolate(
          Math.sin(phase.value * Math.PI * 2),
          [-1, 0, 1],
          [0.28, 0.42, 0.58]
        ),
  }));

  if (slices.length === 0) return null;

  return (
    <>
      <Defs>
        <LinearGradient id="jackpot-metal" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#6E4308" />
          <Stop offset="17%" stopColor="#D49A22" />
          <Stop offset="34%" stopColor="#FFF0A1" />
          <Stop offset="49%" stopColor="#B8750C" />
          <Stop offset="68%" stopColor="#F7D767" />
          <Stop offset="84%" stopColor="#9B5D08" />
          <Stop offset="100%" stopColor="#F1C34A" />
        </LinearGradient>
        <LinearGradient id="jackpot-depth" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="rgba(255,255,225,0.55)" />
          <Stop offset="24%" stopColor="rgba(255,220,112,0.08)" />
          <Stop offset="68%" stopColor="rgba(73,35,0,0.2)" />
          <Stop offset="100%" stopColor="rgba(34,15,0,0.5)" />
        </LinearGradient>
        <LinearGradient id="jackpot-gloss" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <Stop offset="34%" stopColor="rgba(255,250,215,0.12)" />
          <Stop offset="50%" stopColor="rgba(255,255,255,0.92)" />
          <Stop offset="66%" stopColor="rgba(255,244,190,0.16)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </LinearGradient>
        {slices.map((slice, index) => (
          <ClipPath key={slice.id} id={`jackpot-clip-${index}`}>
            <Path d={slice.path} />
          </ClipPath>
        ))}
      </Defs>

      {slices.map((slice, sliceIndex) => (
        <G key={slice.id}>
          <Path
            d={slice.path}
            fill="url(#jackpot-metal)"
            stroke="rgba(255,238,163,0.96)"
            strokeWidth={1.8}
          />
          <G clipPath={`url(#jackpot-clip-${sliceIndex})`}>
            <Path d={slice.path} fill="url(#jackpot-depth)" />
            <AnimatedPath
              d={slice.path}
              fill="none"
              stroke="#FFD56B"
              strokeWidth={4}
              animatedProps={glowProps}
            />
            <AnimatedRect
              y={-size * 0.6}
              width={size * 0.22}
              height={size * 2.2}
              fill="url(#jackpot-gloss)"
              transform={`rotate(-24 ${center} ${center})`}
              animatedProps={glossProps}
              opacity={reducedMotion ? 0.58 : 0.82}
            />
            {GLITTER.map((glitter, index) => {
              const position = polar(
                slice.startDeg + slice.sweepDeg * glitter.angle,
                radius * glitter.radius,
                center
              );
              return (
                <GlitterParticle
                  key={`${slice.id}-${index}`}
                  cx={position.x}
                  cy={position.y}
                  size={glitter.size}
                  offset={glitter.offset + sliceIndex * 0.17}
                  cycles={glitter.cycles}
                  maxOpacity={glitter.opacity}
                  phase={phase}
                  reducedMotion={reducedMotion}
                  round={index >= 5}
                />
              );
            })}
          </G>
        </G>
      ))}
    </>
  );
}
