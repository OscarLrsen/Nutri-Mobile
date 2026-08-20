import { type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/theme";

/**
 * A sheet that comes from the bottom and can be dragged back down.
 *
 * WHY A SHARED WRAPPER. Every bottom sheet in the app was a plain RN `Modal`
 * with a flex-end card: it slid up, and the only way out was the X or the
 * backdrop. Adding a pan gesture per sheet would have meant five slightly
 * different implementations of the same physics — and five places for the
 * "dismissed mid-save" bug to appear. Built on the gesture-handler and
 * reanimated that ship with the app, and on the GestureHandlerRootView that
 * already wraps the tree in app/_layout.tsx. No new dependency.
 *
 * ── SAFE AREA ────────────────────────────────────────────────────────
 *
 * The grabber was landing under the camera. The sheets set their own
 * `maxHeight` ("90%" on the profile editor) and nothing accounted for the
 * top inset, so on a tall phone a full sheet reached into the notch or the
 * Dynamic Island and took its grabber with it — the one control the sheet
 * needs you to be able to hit.
 *
 * The height is now capped from the measured inset, never from a device
 * guess, so it is correct on a Dynamic Island phone, a notch phone and a
 * flat one alike. The maths differs by anchor, which is why the caller says
 * which it is:
 *
 *   bottom — the card is pinned to the bottom edge, so its top is
 *            `screenHeight − cardHeight`. Capping the height by the top
 *            inset plus a gap keeps that edge below the hardware.
 *   center — the card is centred, so the margin above it is only HALF of
 *            what is left over. The cap has to subtract the inset TWICE or
 *            a 90%-tall card still reaches the camera.
 *
 * ── WHERE THE GESTURE LIVES ──────────────────────────────────────────
 *
 * On the grabber strip AND on whatever the caller passes as `header` — the
 * title row of the sheet. That is a large, obvious target: it reads as
 * "take hold of the top of the card and pull it down" rather than "hit a
 * 4-point line". Everything below the header keeps its own gestures.
 *
 * It is deliberately NOT a full-card pan, and that is a bug avoided rather
 * than a style preference:
 *
 *   - Most of these sheets contain a ScrollView. A pan on the whole card
 *     competes with the scroll for the same downward finger, and the loser
 *     is whichever the gesture arbiter picks that frame — a list that
 *     sometimes scrolls and sometimes dismisses.
 *   - Several contain text inputs. A pan spanning the card would start on
 *     the keyboard's own drag region and fight it.
 *
 * A tap is not a drag: `activeOffsetY` means the pan only claims the finger
 * after 12 points of downward movement, so the X button inside the header
 * still receives its taps. `failOffsetX` gives horizontal movement away
 * entirely, so a sideways swipe never drags the sheet.
 *
 * MID-SAVE SAFETY. `enabled={false}` freezes the gesture AND snaps the sheet
 * back to rest, so a save in flight cannot be dismissed out from under
 * itself — the caller passes `enabled={!saving}`.
 */

/** Past this far down, or this fast, the sheet closes. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/**
 * Breathing room between the hardware inset and the top of the card.
 * A literal rather than `spacing[3]` (the same 12) so the height maths
 * below stays free of theme imports and can be exercised directly by the
 * guard, without a renderer.
 */
export const SAFE_TOP_GAP = 12;

/**
 * The tallest a sheet may be and still keep its top edge (and therefore its
 * grabber) clear of the notch. Exported so the guard can exercise the maths
 * for every device shape without a simulator.
 */
export function maxSheetHeight(
  windowHeight: number,
  topInset: number,
  anchor: "bottom" | "center"
): number {
  const clearance = topInset + SAFE_TOP_GAP;
  // Centred cards only get half the leftover space above them, so the
  // clearance has to be reserved on both sides.
  const height = anchor === "center" ? windowHeight - clearance * 2 : windowHeight - clearance;
  // Never return something unusable on a very short screen.
  return Math.max(height, 240);
}

export function SwipeDownSheet({
  children,
  header,
  onDismiss,
  enabled = true,
  anchor = "bottom",
  style,
}: {
  children: ReactNode;
  /** The sheet's own title row. Rendered inside the drag area, so the whole
   *  top of the card can be grabbed. Buttons in it still work. */
  header?: ReactNode;
  /** Called once, when the sheet has been dragged past the dismiss point. */
  onDismiss: () => void;
  /** False while a save/payment is in flight — see MID-SAVE SAFETY above. */
  enabled?: boolean;
  /** How the card is positioned by its parent. Decides the height cap. */
  anchor?: "bottom" | "center";
  style?: ViewStyle;
}) {
  const translateY = useSharedValue(0);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const heightCap = maxSheetHeight(windowHeight, insets.top, anchor);

  const pan = Gesture.Pan()
    .enabled(enabled)
    // Only a clear DOWNWARD drag starts this. The upper bound is left open
    // so an upward flick never begins a dismiss the user has to undo.
    .activeOffsetY([-10_000, 12])
    // Horizontal movement is somebody else's (a carousel, a text selection).
    .failOffsetX([-20, 20])
    .onChange((event) => {
      // Downward only: dragging up must not lift the sheet off its anchor.
      const next = translateY.value + event.changeY;
      translateY.value = next > 0 ? next : 0;
    })
    .onEnd((event) => {
      const shouldDismiss =
        translateY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;

      if (shouldDismiss) {
        // Animate out first so the sheet leaves under the finger rather than
        // vanishing, then hand control back to the caller.
        translateY.value = withTiming(windowHeight, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onDismiss)();
        });
        return;
      }

      translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: enabled ? translateY.value : 0 }],
  }));

  return (
    // The cap is applied AFTER the caller's style so a sheet's own
    // maxHeight can never win over the safe area.
    <Animated.View style={[style, animatedStyle, { maxHeight: heightCap }]}>
      <GestureDetector gesture={pan}>
        {/* The drag target: the grabber plus the sheet's title row. Sized to
            a real touch target rather than the width of the line itself. */}
        <View style={styles.dragArea}>
          <View style={styles.grabberRow} accessible={false}>
            <View style={styles.grabber} />
          </View>
          {header}
        </View>
      </GestureDetector>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Nothing visual — it only exists to group the grabber and the header
  // under one gesture.
  dragArea: {},
  grabberRow: {
    // 44 is the smallest comfortable touch target; the strip was 4 points
    // of visible line inside about 12 points of padding before.
    minHeight: 28,
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    alignItems: "center",
    justifyContent: "center",
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.textMuted,
  },
});
