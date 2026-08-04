import { useEffect } from "react";

import { useAuth } from "@/services/auth/AuthProvider";
import { registerCurrentDeviceForPush } from "@/services/push/pushNotifications";

/**
 * Keeps the backend device registry in sync (patch 10) — renders nothing.
 *
 * Re-registers this device whenever a signed-in user id appears or changes
 * (app start with a session, fresh login, account switch). Registration is
 * a silent no-op unless the OS permission is ALREADY granted — this
 * component never triggers the system prompt; only the explicit user
 * actions in the pre-prompt / profile section do.
 */
export function PushTokenSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    registerCurrentDeviceForPush().catch(() => {});
  }, [userId]);

  return null;
}
