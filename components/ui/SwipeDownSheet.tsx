import { type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

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
 * WHERE THE GESTURE LIVES, AND WHY NOT EVERYWHERE. The drag is bound to the
 * grabber/header strip at the top of the sheet, not to the whole card. Two
 * concrete reasons, both bugs avoided rather than style preferences:
 *
 *   - Most of these sheets contain a ScrollView. A pan on the whole card
 *     competes with the scroll for the same downward finger, and the loser
 *     is whichever the gesture arbiter picks that frame — a list that
 *     sometimes scrolls and sometimes dismisses.
 *   - Several contain text inputs. A pan spanning the card would start on
 *     the keyboard's own drag region and fight it.
 *
 * The grabber is the standard target for this on both platforms, and it is
 * always visible at the top of the sheet.
 *
 * MID-SAVE SAFETY. `enabled={false}` freezes the gesture AND snaps the sheet
 * back to rest, so a save in flight cannot be dismissed out from under
 * itself — the caller passes `enabled={!saving}`.
 */
export function SwipeDownSheet({
  children,
  onDismiss,
  enabled = true,
  style,
}: {
  children: ReactNode;
  /** Called once, when the sheet has been dragged past the dismiss point. */
  onDismiss: () => void;
  /** False while a save/payment is in flight — see MID-SAVE SAFETY above. */
  enabled?: boolean;
  style?: ViewStyle;
}) {
  const translateY = useSharedValue(0);

  /** Past this many points down, or this fast, the sheet closes. */
  const DISMISS_DISTANCE = 120;
  const DISMISS_VELOCITY = 900;

  const pan = Gesture.Pan()
    .enabled(enabled)
    // Only a clear DOWNWARD drag starts this. The upper bound is left open
    // so an upward flick never begins a dismiss the user has to undo.
    .activeOffsetY([-10_000, 12])
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
        translateY.value = withTiming(600, { duration: 180 }, (finished) => {
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
    <Animated.View style={[style, animatedStyle]}>
      <GestureDetector gesture={pan}>
        {/* The drag target. Padded rather than hairline-thin so it is a
            comfortable touch area, and it sits above the sheet's own
            header content. */}
        <View style={styles.grabberArea} accessible={false}>
          <View style={styles.grabber} />
        </View>
      </GestureDetector>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grabberArea: {
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
    alignItems: "center",
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
  },
});
