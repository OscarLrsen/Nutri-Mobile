import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { i18n } from "@/i18n";
import { registerPushDevice, unregisterPushDevice } from "@/services/api/pushDevices";

/**
 * Push notification core (patch 10). Owns the OS-permission plumbing and
 * the device-token lifecycle against the backend registry.
 *
 * Privacy decisions (mirrors the backend's data-minimisation rules):
 * - No exact device model, no advertising id, no location — the register
 *   call carries ONLY the Expo token, platform, app version, app language
 *   and the coarse OS permission status (telemetry, never auth).
 * - The Expo token itself is opaque and revocable; it is kept in
 *   AsyncStorage solely so sign-out can deactivate it server-side.
 */

/** Versioned — bump only if a migration should force re-registration. */
export const PUSH_TOKEN_KEY = "nutri_push_token_v1";

export type PushPermissionStatus = "granted" | "denied" | "undetermined" | "unavailable";

let handlerConfigured = false;

/** Idempotent: install the foreground presentation handler and the Android
 * channel. Safe to call from any entry point that touches notifications. */
export function configureNotificationHandling(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {
      // Channel creation failing must never break the app — Android will
      // fall back to the plugin-declared default channel.
    });
  }
}

/** Current OS-level permission. "unavailable" = simulator/web, where push
 * can never work — callers hide push UI entirely for that value. */
export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (!Device.isDevice) return "unavailable";
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "granted";
    if (status === "undetermined") return "undetermined";
    return "denied";
  } catch {
    return "unavailable";
  }
}

/** Shows the SYSTEM permission prompt. Only ever called from an explicit
 * user action (the pre-prompt's "Aktivera notiser" or the profile section)
 * — never automatically at app start, per the launch spec. */
export async function requestPushPermission(): Promise<PushPermissionStatus> {
  if (!Device.isDevice) return "unavailable";
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted" ? "granted" : status === "undetermined" ? "undetermined" : "denied";
  } catch {
    return "unavailable";
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Registers this device with the backend, if and only if push can actually
 * work here (real device + permission granted + EAS project id known).
 * Idempotent: the backend upserts on the token, and re-running after an
 * account switch moves the token to the newly signed-in user. Never throws
 * — push registration must not be able to break any calling flow.
 */
export async function registerCurrentDeviceForPush(): Promise<boolean> {
  try {
    if (!Device.isDevice) return false;
    if (Platform.OS !== "ios" && Platform.OS !== "android") return false;

    const permission = await getPushPermissionStatus();
    if (permission !== "granted") return false;

    const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return false;

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!expoPushToken) return false;

    await registerPushDevice({
      expoPushToken,
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? undefined,
      deviceLanguage: i18n.language,
      notificationsPermissionStatus: permission,
    });

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, expoPushToken).catch(() => {});
    return true;
  } catch {
    // Offline, backend down, or Expo token fetch failed — silently skip;
    // the next app start retries.
    return false;
  }
}

/**
 * Best-effort deactivation of this device's token server-side. Called
 * BEFORE Supabase sign-out (the API call needs the session) so a shared
 * device stops receiving the previous user's pushes. All failures are
 * swallowed: sign-out must always succeed.
 */
export async function deactivateCurrentDevicePush(): Promise<void> {
  try {
    const token = await getStoredPushToken();
    if (!token) return;
    await unregisterPushDevice(token);
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY).catch(() => {});
  } catch {
    // Ignored — worst case the backend deactivates the token itself on the
    // first DeviceNotRegistered receipt, or the next user's registration
    // moves it.
  }
}
