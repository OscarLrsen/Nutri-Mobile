import { apiClient, requireAuth } from "./client";

/**
 * DELETE /api/account — the customer deletes their OWN account.
 *
 * There is no user id in the call and there deliberately never will be: the
 * backend reads the owner from the verified `sub` claim on the Bearer token,
 * so this endpoint cannot be pointed at somebody else's account no matter
 * what the client sends.
 *
 * The server does the real work — it holds the service-role key, and it is
 * the only place that knows the retention policy (orders are anonymised for
 * bokföringslagen; everything user-owned is deleted). The app must never try
 * to delete an auth user itself.
 *
 * Resolves on 204. Anything else throws, and the caller keeps the customer
 * signed in — a half-cleared client on top of a live account is worse than
 * an error message.
 */
export async function deleteMyAccount(): Promise<void> {
  await apiClient.delete("/api/account", requireAuth());
}
