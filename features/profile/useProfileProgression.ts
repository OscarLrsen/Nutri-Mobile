import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from "react-native";

import { nextAnchorAfter, scrollTargetFor } from "./profileProgression";
import type { ProfileAnchorId, ProfileFormState } from "./profileRequirements";

/**
 * The profile sheet's auto-scroll, in one place.
 *
 * There is deliberately no second mechanism anywhere else: the sheet gets its
 * ScrollView ref, its anchor refs, its scroll bookkeeping and its "move on"
 * call from here, and the decision of WHERE to go is `profileProgression`'s
 * alone.
 *
 * ── HOW A POSITION IS OBTAINED ───────────────────────────────────────
 *
 * By measuring, at the moment of the move — not by remembering an onLayout.
 *
 * The old code stored `e.nativeEvent.layout.y` per block. That number is
 * relative to the block's PARENT, and six of the ten blocks sit inside a
 * grouping <View>. Their stored y was therefore a small offset inside that
 * group (tens of points) rather than their real position in the scroll
 * content (hundreds), so scrolling to it landed near the top of the sheet.
 * That is the second half of the "vyn hoppar upp" report, and no ordering
 * rule alone would have fixed it.
 *
 * `measureLayout` against the content wrapper answers the question that was
 * actually being asked — "where is this block inside the scrollable content"
 * — regardless of how deeply it is nested, and it answers it with the
 * geometry that exists NOW rather than the geometry that existed when the
 * block first laid out.
 *
 * ── WHY TWO ANIMATION FRAMES, AND NO TIMEOUTS ────────────────────────
 *
 * A choice can create the very block being scrolled to (picking a goal
 * reveals "Tempo"). One frame lets React commit that render; the second lets
 * native layout report where it ended up. A timeout would be a guess about
 * how long that takes; two frames is the actual condition being waited for.
 */
export interface ProfileProgression {
  scrollRef: React.RefObject<ScrollView | null>;
  /** Ref for the single wrapper every block is measured against. */
  contentRef: React.RefObject<View | null>;
  /** `ref` callback for a block. Stable ids — never array indices, because
   *  conditional blocks (pace, cyclePhase) come and go. */
  registerAnchor: (id: ProfileAnchorId) => (node: View | null) => void;
  /** Answered something in `from`; move on if there is somewhere to move to. */
  advanceFrom: (from: ProfileAnchorId, form: ProfileFormState) => void;
  /** A numeric field took focus. */
  onNumericFocus: (fieldId: string) => void;
  /** A numeric field lost focus — advance unless another one took over. */
  onNumericBlur: (fieldId: string, from: ProfileAnchorId, form: ProfileFormState) => void;
  /**
   * True while a numeric field holds the keyboard. Drives the sheet's own
   * "Klar" bar — see WHY THE DONE BAR IS NOT AN InputAccessoryView below.
   * It does NOT flicker off while moving between two numeric fields.
   */
  numericFocused: boolean;
  /** Props to spread onto the sheet's ScrollView. */
  scrollViewProps: {
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onLayout: (e: LayoutChangeEvent) => void;
    onContentSizeChange: (w: number, h: number) => void;
    onScrollBeginDrag: () => void;
    onScrollEndDrag: () => void;
    onMomentumScrollEnd: () => void;
    scrollEventThrottle: number;
  };
}

export function useProfileProgression(): ProfileProgression {
  const scrollRef = useRef<ScrollView | null>(null);
  const contentRef = useRef<View | null>(null);
  const anchors = useRef(new Map<ProfileAnchorId, View>());

  const scrollY = useRef(0);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  /** True while a finger is on the list. Auto-scroll never fights a hand. */
  const dragging = useRef(false);

  const focusedNumeric = useRef<string | null>(null);
  const blurFrame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (blurFrame.current !== null) cancelAnimationFrame(blurFrame.current);
      anchors.current.clear();
    },
    []
  );

  // One STABLE callback per block id. Building a fresh closure on every
  // render would make React detach and re-attach every ref each time the
  // form state changes — i.e. on every keystroke — and a block would be
  // momentarily unregistered exactly while a scroll was being prepared.
  const anchorCallbacks = useRef(new Map<ProfileAnchorId, (node: View | null) => void>());
  const registerAnchor = useCallback((id: ProfileAnchorId) => {
    const existing = anchorCallbacks.current.get(id);
    if (existing) return existing;
    const cb = (node: View | null) => {
      if (node) anchors.current.set(id, node);
      else anchors.current.delete(id);
    };
    anchorCallbacks.current.set(id, cb);
    return cb;
  }, []);

  const advanceFrom = useCallback((from: ProfileAnchorId, form: ProfileFormState) => {
    if (dragging.current) return;
    const next = nextAnchorAfter(form, from);
    if (!next) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const node = anchors.current.get(next);
        const content = contentRef.current;
        const scroller = scrollRef.current;
        if (!node || !content || !scroller) return;
        // The customer grabbed the list while we were waiting a frame.
        if (dragging.current) return;

        node.measureLayout(
          content,
          (_x, y, _width, height) => {
            const to = scrollTargetFor({
              targetY: y,
              targetHeight: height,
              currentY: scrollY.current,
              viewportHeight: viewportHeight.current,
              contentHeight: contentHeight.current,
            });
            if (to === null) return;
            scroller.scrollTo({ y: to, animated: true });
          },
          // A block that has unmounted between the tap and the frame cannot
          // be measured. Staying put is the right answer, not a fallback
          // scroll to a number we do not have.
          () => {}
        );
      });
    });
  }, []);

  /**
   * ── WHY THE DONE BAR IS NOT AN InputAccessoryView ──────────────────
   *
   * It was one, and it never appeared. `InputAccessoryView` attaches to the
   * first responder of the app's root window; this whole sheet lives inside
   * a React Native `Modal`, which iOS presents in a window of its own, so
   * the bar registered inside it is never the accessory of the field that
   * has focus. MacroAdjustScreen uses the same pattern successfully — and
   * it is a full screen, not a modal, which is the entire difference.
   *
   * A plain View at the bottom of the sheet cannot fail that way: the
   * KeyboardAvoidingView already lifts the card to sit on top of the
   * keyboard, so the sheet's own bottom edge IS the space above it. That
   * needs a re-render, hence state rather than the ref alone.
   */
  const [numericFocused, setNumericFocused] = useState(false);

  const onNumericFocus = useCallback((fieldId: string) => {
    focusedNumeric.current = fieldId;
    setNumericFocused(true);
    if (blurFrame.current !== null) {
      cancelAnimationFrame(blurFrame.current);
      blurFrame.current = null;
    }
  }, []);

  /**
   * Blur alone does not mean "done": moving from Ålder to Vikt blurs the
   * first field too, and scrolling away from a half-filled block then would
   * be exactly the hostile behaviour this whole change is about. So the
   * advance waits one frame, and a focus arriving in that frame cancels it.
   * Pressing "Klar" (or Done on Android) dismisses the keyboard, nothing
   * takes focus, and the advance runs.
   */
  const onNumericBlur = useCallback(
    (fieldId: string, from: ProfileAnchorId, form: ProfileFormState) => {
      if (focusedNumeric.current === fieldId) focusedNumeric.current = null;
      if (blurFrame.current !== null) cancelAnimationFrame(blurFrame.current);
      blurFrame.current = requestAnimationFrame(() => {
        blurFrame.current = null;
        if (focusedNumeric.current !== null) return;
        setNumericFocused(false);
        advanceFrom(from, form);
      });
    },
    [advanceFrom]
  );

  const scrollViewProps = {
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      scrollY.current = contentOffset.y;
      viewportHeight.current = layoutMeasurement.height;
      contentHeight.current = contentSize.height;
    },
    onLayout: (e: LayoutChangeEvent) => {
      viewportHeight.current = e.nativeEvent.layout.height;
    },
    onContentSizeChange: (_w: number, h: number) => {
      contentHeight.current = h;
    },
    onScrollBeginDrag: () => {
      dragging.current = true;
    },
    onScrollEndDrag: () => {
      dragging.current = false;
    },
    onMomentumScrollEnd: () => {
      dragging.current = false;
    },
    scrollEventThrottle: 16,
  };

  return {
    scrollRef,
    contentRef,
    registerAnchor,
    advanceFrom,
    onNumericFocus,
    onNumericBlur,
    numericFocused,
    scrollViewProps,
  };
}
