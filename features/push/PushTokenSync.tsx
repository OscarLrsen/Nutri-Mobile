import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "@/services/auth/AuthProvider";
import {
  getPushPermissionStatus,
  registerCurrentDeviceForPush,
  requestPushPermission,
} from "@/services/push/pushNotifications";

/**
 * Push permission + device registration for a signed-in user. Renders nothing.
 *
 * ── THE BUG THIS CLOSES ──────────────────────────────────────────────
 *
 * iOS never showed "Vill du tillåta att Nutri skickar notiser?", so no
 * token was ever created and no push could arrive. Not a permissions
 * failure — the app never asked.
 *
 * The only automatic path to the system prompt was PushPrePromptCard,
 * which renders on the ORDER STATUS screen and only for an order the
 * customer had just placed from that installation. Anyone who signs up,
 * logs in and uses the app without ordering never reaches it, and iOS only
 * shows the dialog when the app actually calls requestPermissionsAsync().
 * This component ran on every login but was, by its own documentation, "a
 * silent no-op unless the OS permission is ALREADY granted" — so it could
 * never be the one to ask either. Between them, nothing asked.
 *
 * ── WHAT IT DOES NOW ─────────────────────────────────────────────────
 *
 * On every app start and every login, in order:
 *
 *   1. Try to register. Idempotent, and a no-op unless permission is
 *      already granted — this is also the retry that recovers a device
 *      whose earlier registration failed offline.
 *   2. If that did not register and the OS has NEVER been asked
 *      (status "undetermined"), ask.
 *   3. On grant, register immediately rather than waiting for the next
 *      app start.
 *
 * ── ONE PROMPT, EVER ─────────────────────────────────────────────────
 *
 * iOS gives an app a single system prompt. Two things keep it that way:
 * the `undetermined` check — once the customer answers, iOS reports
 * granted or denied and this stops asking — and a stored flag so a
 * pathological case cannot become a second prompt. The effect is keyed on
 * the user id, so it runs once per signed-in session and never per render.
 *
 * Someone who declines is never asked again from here; re-enabling lives
 * in the profile's Notiser section, which routes to iOS Settings. That is
 * also the recovery path in the one case the stored flag can cost
 * something: the app being killed while the dialog is still open.
 */

/** Versioned — bump only to deliberately re-ask everyone. */
export const PUSH_ASKED_KEY = "nutri_push_asked_v1";

export function PushTokenSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        // 1. Already granted on this device? Register (or re-register) and
        //    stop — there is nothing to ask.
        if (await registerCurrentDeviceForPush()) return;
        if (cancelled) return;

        // 2. Has the OS ever been asked?
        const status = await getPushPermissionStatus();
        if (status !== "undetermined" || cancelled) return;

        // Belt and braces against a second system prompt.
        if ((await AsyncStorage.getItem(PUSH_ASKED_KEY)) === "1" || cancelled) return;
        await AsyncStorage.setItem(PUSH_ASKED_KEY, "1").catch(() => {});
        if (cancelled) return;

        // 3. Ask. THIS is the call that makes iOS show the dialog.
        const result = await requestPushPermission();
        if (cancelled) return;
        if (result === "granted") await registerCurrentDeviceForPush();
      } catch {
        // Push must never break app start. The next start retries
        // registration; the prompt itself is one-shot by design.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
