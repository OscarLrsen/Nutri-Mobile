import { AppState, Platform } from "react-native";
import { QueryClient, focusManager } from "@tanstack/react-query";

/**
 * Shared TanStack Query client. Defaults chosen for a food-truck ordering
 * app on a possibly-flaky connection: short retry count (fail fast, let the
 * UI show a retry action rather than spin silently) and a 30 s default
 * staleTime so navigating between tabs renders cached data instantly.
 *
 * FOREGROUND REFETCH IS WIRED HERE (release fix). `focusManager` follows
 * AppState, so reopening the app marks every mounted query focused and stale
 * ones refetch. This is what makes a stamp earned while the app was pocketed
 * actually APPEAR when the customer looks — the backend had written it; the
 * app just never asked again. Per-query staleTime still governs how eager
 * each dataset is, so wiring focus does not stampede the API.
 *
 * `onlineManager`/NetInfo remains unwired on purpose: the package is not a
 * dependency, and reconnect-refetch matters less than foreground-refetch for
 * a counter-service app. Revisit if offline use grows.
 */
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (status) => {
    focusManager.setFocused(status === "active");
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
