import { StyleSheet, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { dashOffset, ringGeometry, type NutrientRing } from "./nutritionRings";

/**
 * The concentric progress rings, drawn with react-native-svg (already a
 * dependency — no images, no canvas).
 *
 * Each nutrient gets two circles: a dim background track that always shows
 * the full ring, and a coloured arc on top whose visible length is the
 * progress. The arc is drawn by hiding part of the stroke
 * (`strokeDasharray` = the full circumference, `strokeDashoffset` = the
 * unfilled remainder), which is the standard way to do this in SVG and
 * needs no path maths.
 *
 * The whole stack is rotated −90° about its centre so 0% starts at the top
 * and fills clockwise, which is what the reference design shows and what
 * anyone reading a progress ring expects.
 */
export function NutritionRings({
  rings,
  size,
  strokeWidth,
  gap,
  trackOpacity = 0.16,
}: {
  rings: NutrientRing[];
  size: number;
  strokeWidth: number;
  /** Space between neighbouring rings. */
  gap: number;
  trackOpacity?: number;
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
                  stroke={ring.color}
                  strokeOpacity={trackOpacity}
                  strokeWidth={strokeWidth}
                  fill="none"
                />
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
              </G>
            );
          })}
        </G>
      </Svg>
    </View>
  );
}

export const ringStyles = StyleSheet.create({
  centered: { alignItems: "center", justifyContent: "center" },
});
