import { Platform } from "react-native";
import Constants from "expo-constants";

import { apiClient, requireAuth } from "./client";

/**
 * App feedback / bug reports (patch 6) — client for the backend's
 * AppFeedbackController. Create-only in V1 (no customer history view).
 *
 * Metadata policy: ONLY app version, platform and OS version ride along —
 * they exist to help troubleshooting and are treated server-side as
 * untrusted hints. No IP, device identifiers, push tokens, location,
 * health or order data is ever included. The owner (user id + email)
 * comes from the JWT server-side, never from this payload.
 */

export type AppFeedbackType = "Feedback" | "BugReport";
export type AppFeedbackReproducibility = "Yes" | "No" | "Unknown";

export interface CreateAppFeedbackResult {
  id: string;
  status: string;
  createdAt: string;
}

export async function submitAppFeedback(input: {
  type: AppFeedbackType;
  title: string;
  message: string;
  attemptedAction?: string;
  reproducibility?: AppFeedbackReproducibility;
}): Promise<CreateAppFeedbackResult> {
  const { data } = await apiClient.post<CreateAppFeedbackResult>(
    "/api/app-feedback",
    {
      ...input,
      appVersion: Constants.expoConfig?.version ?? undefined,
      platform: Platform.OS,
      osVersion: String(Platform.Version),
    },
    requireAuth()
  );
  return data;
}
