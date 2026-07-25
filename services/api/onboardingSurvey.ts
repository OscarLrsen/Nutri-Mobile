import { apiClient, requireAuth } from "./client";

/**
 * Onboarding survey v1 (patch 4) — client for the backend's
 * OnboardingSurveyController. Shapes copied from OnboardingSurveyDTOs.cs.
 *
 * The backend decides everything: WHO should see the survey (config
 * cutoff + the account's server-side created_at + existing row — the
 * client only reads shouldShow) and WHAT is a valid answer (allowlisted
 * option KEYS; the localized labels live in i18n). Submit and skip are
 * idempotent server-side, so network retries can never create duplicates.
 */

export interface ApiOnboardingSurveyStatus {
  shouldShow: boolean;
  answered: boolean;
  skipped: boolean;
  version: string;
}

/** Stable option keys — must match OnboardingSurveyV1 in the backend. */
export const SURVEY_DISCOVERY_KEYS = [
  "instagram",
  "tiktok",
  "google",
  "friend_family",
  "food_truck",
  "gym_club",
  "other",
] as const;

export const SURVEY_REASON_KEYS = [
  "healthy_food",
  "high_protein",
  "reach_goals",
  "convenience",
  "menu_looked_good",
  "recommendation",
  "other",
] as const;

export async function getOnboardingSurveyStatus(): Promise<ApiOnboardingSurveyStatus> {
  const { data } = await apiClient.get<ApiOnboardingSurveyStatus>(
    "/api/onboarding-survey/me",
    requireAuth()
  );
  return data;
}

export async function submitOnboardingSurvey(input: {
  discoverySource: string;
  choiceReasons: string[];
}): Promise<ApiOnboardingSurveyStatus> {
  const { data } = await apiClient.post<ApiOnboardingSurveyStatus>(
    "/api/onboarding-survey",
    input,
    requireAuth()
  );
  return data;
}

export async function skipOnboardingSurvey(): Promise<ApiOnboardingSurveyStatus> {
  const { data } = await apiClient.post<ApiOnboardingSurveyStatus>(
    "/api/onboarding-survey/skip",
    undefined,
    requireAuth()
  );
  return data;
}
