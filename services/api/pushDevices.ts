import { apiClient, requireAuth } from "./client";

/**
 * Push device registry — client for the backend's PushDevicesController.
 * Shapes copied from DTOs/PushDTOs.cs. The backend always binds a token to
 * the AUTHENTICATED user from the JWT — no user id is ever sent from here,
 * so a manipulated client cannot register a device on someone else's
 * account.
 */

export interface ApiPushDevice {
  expoPushToken: string;
  platform: string;
  isActive: boolean;
  orderUpdatesEnabled: boolean;
  weeklyRewardsEnabled: boolean;
  profileRemindersEnabled: boolean;
  lastRegisteredAt: string;
}

export interface RegisterPushDeviceInput {
  expoPushToken: string;
  platform: "ios" | "android";
  deviceLabel?: string;
  appVersion?: string;
  /** "sv" | "en" | "da" — the backend composes push texts server-side in
   * this language. */
  deviceLanguage?: string;
  /** OS permission status as telemetry only — never used for auth. */
  notificationsPermissionStatus?: string;
}

/** POST /api/push-devices/register — idempotent upsert keyed on the Expo
 * token. Re-registering after an account switch moves the token to the new
 * user server-side. Order updates default ON (the prompt was accepted from
 * the order flow); weekly rewards and profile reminders default OFF until
 * explicitly enabled in Profile → Notiser. */
export async function registerPushDevice(input: RegisterPushDeviceInput): Promise<ApiPushDevice> {
  const { data } = await apiClient.post<ApiPushDevice>(
    "/api/push-devices/register",
    input,
    requireAuth()
  );
  return data;
}

/** GET /api/push-devices/me — the caller's own registered devices. */
export async function getMyPushDevices(): Promise<ApiPushDevice[]> {
  const { data } = await apiClient.get<ApiPushDevice[]>("/api/push-devices/me", requireAuth());
  return data;
}

/** PUT /api/push-devices/preferences — per-category toggles for ONE of the
 * caller's own devices (404 for anyone else's token). */
export async function setPushDevicePreferences(input: {
  expoPushToken: string;
  orderUpdatesEnabled: boolean;
  weeklyRewardsEnabled: boolean;
  profileRemindersEnabled: boolean;
}): Promise<ApiPushDevice> {
  const { data } = await apiClient.put<ApiPushDevice>(
    "/api/push-devices/preferences",
    input,
    requireAuth()
  );
  return data;
}

/** DELETE /api/push-devices/current — deactivates the token (idempotent).
 * Called best-effort before sign-out so a shared device stops receiving
 * the previous user's pushes. */
export async function unregisterPushDevice(expoPushToken: string): Promise<void> {
  await apiClient.delete("/api/push-devices/current", {
    ...requireAuth(),
    data: { expoPushToken },
  });
}
