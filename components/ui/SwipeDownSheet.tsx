import { useEffect, useState, type ReactNode } from "react";
import {
  AppState,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
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
 * Largest plausible top inset, as a share of screen height. The Dynamic
 * Island is about 7%; nothing real approaches 20%. Anything above this is a
 * measurement, not a notch.
 */
const MAX_PLAUSIBLE_INSET_RATIO = 0.2;

/** A sheet is never squeezed below this share of the screen. */
const MIN_SHEET_RATIO = 0.6;

/**
 * The tallest a sheet may be and still keep its top edge (and therefore its
 * grabber) clear of the notch — or null when the window cannot be trusted,
 * in which case the caller's own maxHeight applies unchanged.
 *
 * WHY IT IS DEFENSIVE. This function is fed two measurements it cannot
 * verify, and returning from Safari is exactly when they go wrong: iOS
 * re-measures on foreground, and react-native-safe-area-context can report
 * an inflated top inset (or the window a height of 0) for a frame or more
 * while a Modal is presented. The first version turned any such reading into
 * `Math.max(..., 240)` — a hard 240-point floor — so one bad measurement
 * became a tiny centred card that survived closing and reopening the sheet.
 * That is the reported regression.
 *
 * Two rules make a bad reading harmless rather than visible:
 *   - an implausible inset is ignored, not obeyed;
 *   - the floor is a SHARE of the window, not an absolute 240, so the worst
 *     case is a slightly shorter sheet instead of a chip.
 *
 * Exported so the guard can exercise every device shape, and every failure
 * mode, without a simulator.
 */
export function maxSheetHeight(
  windowHeight: number,
  topInset: number,
  anchor: "bottom" | "center"
): number | null {
  // No trustworthy window: cap nothing and let the caller's own style stand.
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) return null;

  // An inset larger than any real notch is a bad measurement. Obeying it is
  // what produced the mini-card; ignoring it costs nothing, because the
  // clamp only ever lets the sheet be TALLER than a nonsense reading would.
  const plausibleInset =
    Number.isFinite(topInset) && topInset > 0
      ? Math.min(topInset, windowHeight * MAX_PLAUSIBLE_INSET_RATIO)
      : 0;

  const clearance = plausibleInset + SAFE_TOP_GAP;
  // Centred cards only get half the leftover space above them, so the
  // clearance has to be reserved on both sides.
  const height = anchor === "center" ? windowHeight - clearance * 2 : windowHeight - clearance;

  return Math.max(height, windowHeight * MIN_SHEET_RATIO);
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

  // ── Re-measure when the app comes back to the foreground ───────────
  //
  // Opening the body-fat guide sends the customer to Safari, which
  // backgrounds the app with this sheet still mounted. iOS re-measures on
  // the way back, and the values that arrive first can be wrong. Neither
  // useWindowDimensions nor useSafeAreaInsets necessarily re-renders this
  // component again once they settle — so it could keep a bad reading for
  // the rest of the sheet's life. Bumping state on `active` forces one more
  // render, at which point both hooks are read again.
  const [, forceRemeasure] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") forceRemeasure((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  // A reopened sheet must never inherit a partial drag from the last one.
  // The shared value survives as long as this component instance does, and
  // callers keep the sheet mounted across open/close in some screens.
  useEffect(() => {
    translateY.value = 0;
  }, [translateY]);

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
        // Travel the real screen height so the card clears the bottom on a
        // tall phone — with a fallback, because a zero window would leave
        // the sheet sitting still and never call onDismiss.
        const exitDistance = windowHeight > 0 ? windowHeight : 800;
        translateY.value = withTiming(exitDistance, { duration: 180 }, (finished) => {
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
    // The cap is applied AFTER the caller's style so a sheet's own maxHeight
    // can never win over the safe area — but only when there IS one. A null
    // cap leaves the property absent entirely, so an untrustworthy window
    // falls back to the caller's own style instead of overriding it with a
    // number derived from a bad measurement.
    <Animated.View
      style={[style, animatedStyle, heightCap !== null ? { maxHeight: heightCap } : null]}
    >
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
