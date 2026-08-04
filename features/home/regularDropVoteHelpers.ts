import type {
  ApiRegularDropOption,
  ApiRegularDropResponse,
} from "@/services/api/regularDrops";
import type { RegularDropApiErrorCode } from "@/utils/regularDropErrors";

/**
 * Pure helpers for the vote sheet — error-code → i18n mapping, retryability
 * and server-truth option resolution. No React/i18n imports so everything
 * is unit-testable.
 */

const ERROR_KEYS = {
  network: "regularDrops.errors.network",
  pollNotActive: "regularDrops.errors.pollNotActive",
  pollNotFound: "regularDrops.errors.pollNotFound",
  optionNotFound: "regularDrops.errors.optionNotFound",
  optionMismatch: "regularDrops.errors.optionMismatch",
  invalidUser: "regularDrops.errors.unauthorized",
  unknown: "regularDrops.errors.unknown",
} as const;

export type VoteErrorI18nKey = (typeof ERROR_KEYS)[RegularDropApiErrorCode];

/** Customer copy is ALWAYS the i18n key — never the parser's technical
 * message. */
export function voteErrorI18nKey(code: RegularDropApiErrorCode): VoteErrorI18nKey {
  return ERROR_KEYS[code] ?? ERROR_KEYS.unknown;
}

/** Only transient failures may re-run the SAME confirmation. Domain errors
 * (poll gone/closed, option gone/mismatched, auth) need fresh server data
 * or a different action — no spam-retry. */
export function isRetryableVoteError(code: RegularDropApiErrorCode): boolean {
  return code === "network" || code === "unknown";
}

/** Errors after which the poll data on Home must be considered stale — the
 * sheet closes via the stale path and the active query is refetched. */
export function isStaleDataVoteError(code: RegularDropApiErrorCode): boolean {
  return code === "pollNotActive" || code === "pollNotFound"
    || code === "optionNotFound" || code === "optionMismatch";
}

/**
 * Resolves the option the SERVER says the user voted for. The requested
 * option is deliberately not an input — the 200 carries the server's
 * CURRENT registered vote (votes are changeable while the poll is active;
 * on a two-device race the last write wins), and the UI must show that.
 * Null when the server's votedOptionId matches no option (render generic
 * success copy, never guess).
 */
export function resolveVotedOption(
  response: ApiRegularDropResponse
): ApiRegularDropOption | null {
  const poll = response.poll;
  if (!poll || !poll.votedOptionId) return null;
  return poll.options.find((o) => o.id === poll.votedOptionId) ?? null;
}
