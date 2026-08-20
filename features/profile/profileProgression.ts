import { PROFILE_STEPS, type ProfileAnchorId, type ProfileFormState } from "./profileRequirements";

/**
 * THE ONE SET OF RULES for moving a customer forward through the profile
 * form. Pure on purpose: no React, no react-native, no refs — so the guard
 * can exercise every case without a renderer, and so there is exactly one
 * place that decides where the sheet goes next.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────
 *
 * The previous rule was `PROFILE_STEPS.find(first required gap)`, which
 * searched from the TOP of the list every time. Answering a question near
 * the bottom while an earlier one was still blank therefore scrolled the
 * sheet BACKWARDS — pick a body-fat level before typing your weight and the
 * form threw you up to "Grunddata"; pick a goal before answering steps and
 * it threw you up to "Aktivitet". That is the reported "vyn hoppar upp".
 *
 * The rule is now directional: progression only ever looks FORWARD from the
 * block the customer is in, and `scrollTargetFor` refuses to produce a
 * backwards scroll even if a measurement said otherwise. The customer moves
 * up only by scrolling themselves.
 */

/** Breathing room above the block being scrolled to. */
export const SCROLL_TOP_PADDING = 20;

/**
 * The block to move to after answering something in `current`.
 *
 * Three outcomes, and the middle one is the whole point:
 *   - a required gap LATER in the form  → that block,
 *   - a required gap still inside `current` → null: the customer is already
 *     looking at it (typing an age with the weight still blank must not
 *     scroll the weight field away),
 *   - nothing left → null.
 *
 * Steps BEFORE `current` are never returned. Anything blank up there is
 * named by the save gate's "det här saknas" list, which is a statement
 * rather than a hijacked scroll position.
 */
export function nextAnchorAfter(
  form: ProfileFormState,
  current: ProfileAnchorId
): ProfileAnchorId | null {
  // Two steps share the "basics" anchor (gender, then the three numbers), so
  // the search starts at the block's FIRST step and walks past both.
  const startIdx = PROFILE_STEPS.findIndex((s) => s.anchor === current);
  if (startIdx < 0) return null;

  for (let i = startIdx + 1; i < PROFILE_STEPS.length; i++) {
    const step = PROFILE_STEPS[i];
    if (!step.required || !step.applies(form) || step.filled(form)) continue;
    // The gap is in the block on screen — nothing to move to.
    if (step.anchor === current) return null;
    return step.anchor;
  }
  return null;
}

export interface ScrollGeometry {
  /** The target block's offset inside the scroll content. */
  targetY: number;
  /** The target block's height. */
  targetHeight: number;
  /** Where the ScrollView is scrolled to right now. */
  currentY: number;
  /** Visible height of the ScrollView. */
  viewportHeight: number;
  /** Total height of the scroll content. */
  contentHeight: number;
}

/**
 * Where to scroll so `target` is comfortably in view — or null for "leave it
 * alone", which is a first-class answer here.
 *
 * Null is returned when:
 *   - the block is already shown well enough (product rule C: no pointless
 *     scrolling),
 *   - the scroll would go UP (product rule D: the form never walks the
 *     customer backwards),
 *   - the geometry has not been measured yet, so any number would be a guess.
 *
 * The result is clamped to the real scrollable range, so it can never be
 * negative and never overshoots the end of the content.
 */
export function scrollTargetFor(geo: ScrollGeometry): number | null {
  const { targetY, targetHeight, currentY, viewportHeight, contentHeight } = geo;

  // Nothing has laid out yet (a sheet mid-open, a measurement that failed).
  if (!(viewportHeight > 0) || !Number.isFinite(targetY)) return null;

  const viewportBottom = currentY + viewportHeight;
  // How much of the block is on screen right now.
  const shown = Math.min(targetY + targetHeight, viewportBottom) - Math.max(targetY, currentY);
  // A block taller than the sheet can never be fully visible; a viewport's
  // worth of it is the most anyone can be shown.
  const enough = Math.min(targetHeight, viewportHeight - SCROLL_TOP_PADDING);
  if (targetY >= currentY && shown >= enough) return null;

  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const desired = Math.min(Math.max(targetY - SCROLL_TOP_PADDING, 0), maxScroll);

  // NEVER BACKWARDS. Even a correct measurement can point above the current
  // position — a shrinking conditional block, a keyboard closing, content
  // that re-flowed. Going up is the customer's call, not the form's.
  if (desired <= currentY) return null;

  return desired;
}
