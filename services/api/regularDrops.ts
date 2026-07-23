import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/AuthProvider";
import type { ApiError } from "@/types/api";

import { apiClient, requireAuth } from "./client";

/**
 * Regular Drops — the customer poll behind Home's "Rösta fram nästa Nutri
 * Drop" card. Field shapes copied verbatim from NutriBackend
 * DTOs/RegularDropDTOs.cs (mobile section).
 *
 * Contract rules the data layer relies on:
 * - an ACTIVE poll never carries `result` (product decision — no results
 *   until the poll has ended); the client must never derive live numbers.
 *   The one exception is `leadingOptionIds`: only WHICH option(s) share
 *   the current top vote count (Home's leader star) — never counts.
 * - `result` exists only for a recently ended poll the user voted in
 *   (visible for at most 7 days server-side).
 * - while the poll is active a vote may be CHANGED (idempotent
 *   last-write-wins server-side); the response's votedOptionId is always
 *   the server's current registered vote and is the truth the cache stores.
 * - the voter is always the JWT subject; no user id is ever sent.
 */

export interface ApiRegularDropOption {
  id: string;
  nameSv: string;
  nameEn: string;
  nameDa: string;
  teaserSv: string;
  teaserEn: string;
  teaserDa: string;
  imageUrl: string | null;
  displayOrder: number;
}

export interface ApiRegularDropOptionResult {
  optionId: string;
  votes: number;
  percent: number;
}

export interface ApiRegularDropResult {
  totalVotes: number;
  options: ApiRegularDropOptionResult[];
  winnerOptionIds: string[];
  isTie: boolean;
}

export interface ApiRegularDropPoll {
  id: string;
  titleSv: string;
  titleEn: string;
  titleDa: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  isEnded: boolean;
  hasVoted: boolean;
  votedOptionId: string | null;
  /** Option ids sharing the current top vote count (no numbers exposed);
   * empty while nobody has voted, equals the winners once ended. */
  leadingOptionIds: string[];
  options: ApiRegularDropOption[];
  /** Null while the poll is active — always, even after the user's vote. */
  result: ApiRegularDropResult | null;
}

export interface ApiRegularDropResponse {
  poll: ApiRegularDropPoll | null;
}

/** GET /api/regular-drops/active — the active poll, else the most recently
 * ended poll (≤7 days) the caller voted in, else { poll: null }. */
export async function getActiveRegularDrop(): Promise<ApiRegularDropResponse> {
  const { data } = await apiClient.get<ApiRegularDropResponse>(
    "/api/regular-drops/active",
    requireAuth()
  );
  return data;
}

/** POST /api/regular-drops/{pollId}/vote — casts or changes the caller's
 * single vote (idempotent last-write-wins while the poll is active; the
 * response carries the server's current registered vote). Errors surface
 * as normalized ApiError (parse with utils/regularDropErrors). */
export async function voteOnRegularDrop(
  pollId: string,
  optionId: string
): Promise<ApiRegularDropResponse> {
  const { data } = await apiClient.post<ApiRegularDropResponse>(
    `/api/regular-drops/${pollId}/vote`,
    { optionId },
    requireAuth()
  );
  return data;
}

/** Query keys — user-scoped like ["nutrition", …, userId] so two accounts
 * on one device never share poll/vote cache rows. The id is cache scoping
 * only; it is never sent to the endpoint. */
export const regularDropKeys = {
  all: ["regularDrops"] as const,
  active: (userId: string | null) => ["regularDrops", "active", userId] as const,
};

function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  const status = (error as ApiError | undefined)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

/**
 * The active-poll query. Auth-gated; 4xx (incl. 401/404/409) is never
 * retried, network failures get the standard two retries. Home's card will
 * degrade quietly on `error` (fas 6). `refetchInterval` is caller-supplied
 * as a function of the latest data, so the UI can poll while a poll is
 * active and stop when it is gone.
 */
export function useActiveRegularDropQuery(options?: {
  refetchInterval?: number | false | ((data: ApiRegularDropResponse | undefined) => number | false);
}) {
  const { user } = useAuth();
  const interval = options?.refetchInterval;
  return useQuery<ApiRegularDropResponse, ApiError>({
    queryKey: regularDropKeys.active(user?.id ?? null),
    queryFn: getActiveRegularDrop,
    enabled: !!user,
    retry: retryUnlessClientError,
    refetchInterval:
      typeof interval === "function" ? (query) => interval(query.state.data) : interval,
  });
}

/**
 * The vote action. No optimistic update — the cache is written only with
 * the server's confirmed response, whose votedOptionId is the server's
 * current registered vote (last write wins when this call raced a vote
 * from another device). Errors are rethrown for the UI to parse/translate
 * (no toast here).
 */
export function useRegularDropVote() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useCallback(
    async (pollId: string, optionId: string): Promise<ApiRegularDropResponse> => {
      const response = await voteOnRegularDrop(pollId, optionId);
      // Server truth straight into the cache — no extra refetch needed.
      queryClient.setQueryData(regularDropKeys.active(userId), response);
      return response;
    },
    [queryClient, userId]
  );
}
