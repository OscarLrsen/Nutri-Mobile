/**
 * Whether an auth deep link is being processed RIGHT NOW.
 *
 * AuthDeepLinkHandler reports it; the `auth/callback` screen subscribes so
 * it can render "Signing you in…" only while that is actually true, and
 * leave otherwise.
 *
 * WHY IT EXISTS. The callback route sits outside both Stack.Protected
 * groups so the confirmation link resolves whether the customer is signed
 * in or out. That makes it permanently available — and an always-available
 * route is a route the navigator can fall back to. It did: after a sign-out
 * (account deletion, or an ordinary logout) the navigator dropped every
 * guarded screen and landed on the first one still standing, which was this
 * one, and the app sat on "Signing you in…" with nothing to sign in.
 *
 * A route that is always mountable therefore needs to be able to say "not
 * me" — which is what this registry is for. Same lightweight subscription
 * pattern as features/overlays/overlayActivity.
 */

let inFlight = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** An auth link with usable tokens has started being exchanged. */
export function beginAuthLink(): void {
  inFlight += 1;
  notify();
}

/** That exchange finished — succeeded or failed, both end the wait. */
export function endAuthLink(): void {
  inFlight = Math.max(0, inFlight - 1);
  notify();
}

export function isAuthLinkInFlight(): boolean {
  return inFlight > 0;
}

export function subscribeAuthLinkActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam — resets the counter between guard assertions. */
export function resetAuthLinkActivityForTests(): void {
  inFlight = 0;
  notify();
}
