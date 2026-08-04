/**
 * Tiny shared visibility registry for the app-level nudge modals (patch 4
 * overlay control). WelcomeCouponModal and SpinNudgeSheet report their
 * local `visible` state here (one additive effect each — their own
 * show/defer logic is untouched), and the onboarding survey subscribes so
 * it never renders while either nudge is active. Same lightweight
 * subscription pattern as features/onboarding/introStorage.
 */

type NudgeOverlay = "welcomeCoupon" | "spinNudge";

const active = new Set<NudgeOverlay>();
const listeners = new Set<() => void>();

export function setNudgeOverlayActive(name: NudgeOverlay, isActive: boolean): void {
  const changed = isActive ? !active.has(name) : active.has(name);
  if (!changed) return;
  if (isActive) active.add(name);
  else active.delete(name);
  listeners.forEach((listener) => listener());
}

export function isAnyNudgeOverlayActive(): boolean {
  return active.size > 0;
}

export function subscribeNudgeOverlayActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
