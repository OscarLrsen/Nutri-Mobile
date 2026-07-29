import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/AuthProvider";
import type { ApiError } from "@/types/api";

import {
  getStampCardHistory,
  getStampCardStatus,
  type ApiStampCardHistory,
  type ApiStampCardStatus,
} from "./stampCard";

/**
 * Shared query hooks for the stamp card (patch 16B), following the same
 * pattern as nutritionQueries: one place owns the keys, so any screen that
 * invalidates ["stamp-card"] refreshes every consumer at once.
 *
 * Keys are user-scoped and the queries are auth-gated, so two accounts on the
 * same device can never read each other's rows — switching account changes
 * the key, and the new key has no cache entry to flash before the fetch
 * resolves. Nothing about the progress is persisted locally; the numbers only
 * ever come from the server.
 */

export const STAMP_CARD_QUERY_ROOT = "stamp-card";

/**
 * True when the backend has no stamp card endpoints at all — i.e. the API is
 * running a build from before patch 16A.
 *
 * This is the one case that must NOT be shown as an empty card: "the feature
 * does not exist here" and "you have zero stamps" look identical to a
 * customer but mean completely different things, and quietly rendering 0/10
 * would tell someone with nine stamps that they had lost them.
 */
export function isStampCardUnavailableError(error: unknown): boolean {
  return (error as ApiError | undefined)?.status === 404;
}

function retryUnlessUnavailable(failureCount: number, error: unknown): boolean {
  // 404 (feature absent) and 401 (session gone — the shared auth flow owns
  // that) are stable answers, not transient failures.
  const status = (error as ApiError | undefined)?.status;
  if (status === 404 || status === 401) return false;
  return failureCount < 2;
}

export function useStampCardStatusQuery() {
  const { user } = useAuth();
  return useQuery<ApiStampCardStatus>({
    queryKey: [STAMP_CARD_QUERY_ROOT, "status", user?.id ?? null],
    queryFn: getStampCardStatus,
    enabled: !!user?.id,
    retry: retryUnlessUnavailable,
  });
}

export function useStampCardHistoryQuery(limit = 20) {
  const { user } = useAuth();
  return useQuery<ApiStampCardHistory>({
    queryKey: [STAMP_CARD_QUERY_ROOT, "history", user?.id ?? null, limit],
    queryFn: () => getStampCardHistory(limit),
    enabled: !!user?.id,
    retry: retryUnlessUnavailable,
  });
}

/**
 * Refetches the stamp card whenever the screen regains focus.
 *
 * This is the mechanism that makes a stamp appear after pickup. The kitchen
 * marks the order delivered in its own app, so nothing can push into this
 * device's cache; and the shared client's 30s staleTime would otherwise let a
 * freshly earned stamp sit invisible. focusManager/AppState is deliberately
 * not wired in lib/queryClient.ts, so refetchOnWindowFocus does nothing in
 * React Native — useFocusEffect is the working equivalent.
 */
export function useStampCardFocusRefetch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void queryClient.invalidateQueries({ queryKey: [STAMP_CARD_QUERY_ROOT] });
    }, [queryClient, userId])
  );
}
