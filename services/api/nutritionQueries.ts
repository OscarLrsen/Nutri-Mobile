import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/AuthProvider";
import type { ApiError } from "@/types/api";

import {
  getRemainingToday,
  getTodayNutrition,
  type ApiRemainingToday,
  type ApiTodayNutrition,
} from "./nutrition";

/**
 * Shared TanStack Query hooks for the daily-nutrition endpoints. Hem is the
 * first consumer; the point of centralizing the keys here is that any future
 * consumer (Profil, Anpassar, a meal-registration flow) invalidating
 * ["nutrition"] refreshes every screen at once instead of each screen owning
 * a private copy of the same server truth.
 *
 * Both queries are auth-gated (enabled only with a signed-in user) and keyed
 * on the user id so two accounts on the same device never share cache rows.
 *
 * The backend answers 404 (no nutrition profile) / 422 (incomplete profile)
 * on these endpoints — that is a stable "go finish onboarding" answer, not a
 * transient failure, so it is never retried and is exposed via
 * isProfileGapError for the missing-profile UI state.
 */

export function isProfileGapError(error: unknown): boolean {
  const status = (error as ApiError | undefined)?.status;
  return status === 404 || status === 422;
}

function retryUnlessProfileGap(failureCount: number, error: unknown): boolean {
  if (isProfileGapError(error)) return false;
  return failureCount < 2;
}

/** GET /api/nutrition-profile/today — carb-cycled targets + dayType. */
export function useTodayNutritionQuery() {
  const { user } = useAuth();
  return useQuery<ApiTodayNutrition, ApiError>({
    queryKey: ["nutrition", "today", user?.id ?? null],
    queryFn: getTodayNutrition,
    enabled: !!user,
    retry: retryUnlessProfileGap,
  });
}

/** GET /api/nutrition-profile/remaining-today.
 *
 * SEMANTICS: consumedToday is the sum of today's ACCEPTED ORDERS (backend
 * counts Confirmed/Preparing/Ready/Delivered order lines) — the user has not
 * registered anything as eaten. UI copy must therefore say "beställt", never
 * "ätit"/"konsumerat"/"loggat"/"registrerat". */
export function useRemainingTodayQuery() {
  const { user } = useAuth();
  return useQuery<ApiRemainingToday, ApiError>({
    queryKey: ["nutrition", "remaining-today", user?.id ?? null],
    queryFn: getRemainingToday,
    enabled: !!user,
    retry: retryUnlessProfileGap,
  });
}
