import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { dashOffset, ringGeometry, type NutrientRing } from "./nutritionRings";

/**
 * The concentric progress rings, drawn with react-native-svg (already a
 * dependency — no images, no canvas).
 *
 * Each nutrient gets two circles: a background track showing the full ring,
 * and a coloured arc on top whose visible length is the progress. The arc is
 * drawn by hiding part of the stroke (`strokeDasharray` = the full
 * circumference, `strokeDashoffset` = the unfilled remainder), which is the
 * standard way to do this in SVG and needs no path maths.
 *
 * THE TRACK IS NEUTRAL, AND THAT IS THE FIX. It used to be drawn in the
 * NUTRIENT'S OWN COLOUR at 16% opacity. A full circle in protein-red behind
 * a 28% arc in protein-red does not read as "28% of the way" — it reads as a
 * full red ring, which is exactly how this was reported: the rings looked
 * filled by the target rather than by what had been eaten. The numerator was
 * correct the whole time; the colour was lying about it. Only real progress
 * carries colour now.
 *
 * The whole stack is rotated −90° about its centre so 0% starts at the top
 * and fills clockwise, which is what the reference design shows and what
 * anyone reading a progress ring expects.
 */

/** Neutral, so an empty ring can never be mistaken for a full one. */
const TRACK_COLOR = "#FFFFFF";
const TRACK_OPACITY = 0.1;

export function NutritionRings({
  rings,
  size,
  strokeWidth,
  gap,
}: {
  rings: NutrientRing[];
  size: number;
  strokeWidth: number;
  /** Space between neighbouring rings. */
  gap: number;
}) {
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Start at 12 o'clock instead of 3 o'clock. */}
        <G rotation={-90} origin={`${center}, ${center}`}>
          {rings.map((ring, index) => {
            const { radius, circumference } = ringGeometry(size, strokeWidth, gap, index);
            // A ring stack deeper than the radius allows would produce a
            // negative radius and an invalid circle.
            if (radius <= 0) return null;

            return (
              <G key={ring.key}>
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={TRACK_COLOR}
                  strokeOpacity={TRACK_OPACITY}
                  strokeWidth={strokeWidth}
                  fill="none"
                />
                {/* Nothing eaten means nothing drawn. A round linecap paints
                    a visible dot even at zero length, which on an untouched
                    day would show progress that has not happened. */}
                {ring.progress > 0 ? (
                  <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={ring.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={dashOffset(circumference, ring.progress)}
                  />
                ) : null}
              </G>
            );
          })}
        </G>
      </Svg>
    </View>
  );
}
