import { apiClient, requireAuth } from "./client";

/**
 * Consent records — client for the backend's ConsentsController, the source
 * of truth for what the user has agreed to (terms of service, privacy
 * policy, marketing e-mail). Shapes copied from DTOs/ConsentDTOs.cs.
 *
 * The backend stamps the consent-text VERSION itself (ConsentVersions.cs) —
 * clients never send one, so a stale app can never claim approval of a
 * newer text than the one actually published.
 */

export interface ApiConsent {
  /** "TermsOfService" | "PrivacyPolicy" | "EmailMarketing". */
  type: string;
  active: boolean;
  version: string;
  source: string;
  grantedAt: string;
  revokedAt: string | null;
}

export interface ApiConsentsResponse {
  consents: ApiConsent[];
  emailMarketingActive: boolean;
  /** Server-decided consent gate (patch 1.1): true = this account must
   * accept the current terms + privacy policy before authenticated
   * customer endpoints respond (the backend enforces it with 403s — the
   * client only renders the blocking screen; it never computes exemption
   * itself). */
  requiresAcceptance: boolean;
}

/** GET /api/consents/me — the caller's current consent state. Also
 * backfills a legacy Supabase-metadata marketing opt-in into the backend
 * model on first read (server-side; nothing for the client to do). */
export async function getMyConsents(): Promise<ApiConsentsResponse> {
  const { data } = await apiClient.get<ApiConsentsResponse>("/api/consents/me", requireAuth());
  return data;
}

/** POST /api/consents/registration — records the signup consents right
 * after the account gets its first session. The backend rejects the call
 * unless BOTH mandatory acceptances are true (a manipulated client cannot
 * skip them), and is idempotent on retries. */
export async function submitRegistrationConsents(input: {
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  emailMarketing: boolean;
}): Promise<ApiConsentsResponse> {
  const { data } = await apiClient.post<ApiConsentsResponse>(
    "/api/consents/registration",
    { ...input, source: "mobile_signup" },
    requireAuth()
  );
  return data;
}

/** The consent-gate screen's accept action: registers the two MANDATORY
 * consents only. emailMarketing:false is a no-op server-side (registration
 * never revokes marketing), so an existing marketing opt-in is untouched —
 * the gate never bundles marketing, per the launch decisions. */
export async function acceptMandatoryConsents(): Promise<ApiConsentsResponse> {
  return submitRegistrationConsents({
    acceptTerms: true,
    acceptPrivacy: true,
    emailMarketing: false,
  });
}

/** PUT /api/consents/email-marketing — the profile newsletter toggle.
 * Granting also clears a previous e-mail-link opt-out server-side; revoking
 * sets it, so every legacy send-path guard stays correct. */
export async function setEmailMarketingConsent(granted: boolean): Promise<ApiConsentsResponse> {
  const { data } = await apiClient.put<ApiConsentsResponse>(
    "/api/consents/email-marketing",
    { granted, source: "mobile_profile" },
    requireAuth()
  );
  return data;
}
