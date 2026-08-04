import { AppState, type AppStateStatus } from "react-native";
import { useSyncExternalStore } from "react";

/**
 * What "an app session" means for the food-feedback prompt — robustly, not
 * "the component happened to re-render".
 *
 * A SESSION STARTS when the app cold-starts (module load) and every time it
 * returns to the foreground after having been in the background. That is the
 * definition the requirement needs: an order delivered while the customer
 * was in the app is asked about at the NEXT opening, and "Inte nu" holds
 * until they leave and come back — no longer, no shorter.
 *
 * Module-level state, deliberately not AsyncStorage: "Inte nu" must NOT be
 * permanent (the server keeps no skip row any more), and surviving process
 * death is exactly what a session must not do.
 */

type SessionState = {
  /** When the current session began (cold start or return to foreground). */
  startedAt: number;
  /** "Inte nu" / close was chosen in THIS session. */
  dismissed: boolean;
};

let state: SessionState = { startedAt: Date.now(), dismissed: false };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

let previousAppState: AppStateStatus = AppState.currentState;
AppState.addEventListener("change", (next) => {
  // background → active is a NEW session. "inactive" (iOS app switcher,
  // notification shade) is not leaving the app and does not count.
  if (next === "active" && previousAppState === "background") {
    state = { startedAt: Date.now(), dismissed: false };
    emit();
  }
  previousAppState = next;
});

export function dismissFeedbackForSession(): void {
  if (state.dismissed) return;
  state = { ...state, dismissed: true };
  emit();
}

/** Test/logout hook: forget the session marker (e.g. when the user signs
 * out, the next account must not inherit the dismissal). */
export function resetFeedbackSession(): void {
  state = { startedAt: Date.now(), dismissed: false };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SessionState {
  return state;
}

/** The current feedback session, live: components re-render when a new
 * session starts or the prompt is dismissed for this session. */
export function useFeedbackSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
