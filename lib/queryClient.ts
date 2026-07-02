import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client. Defaults chosen for a food-truck ordering
 * app on a possibly-flaky connection (spec §21's "offline cache" gap):
 * short retry count (fail fast, let the UI show a retry action rather than
 * spin silently).
 *
 * NOT YET WIRED (a real gap, not a stylistic choice — flag before shipping
 * a feature phase that depends on background refetch): TanStack Query's
 * React Native integration for refetch-on-app-foreground/reconnect needs
 * `onlineManager`/`focusManager` wired to `@react-native-community/netinfo`
 * and `AppState`, per TanStack Query's own React Native setup docs. Without
 * it, queries only refetch when a component re-mounts or staleTime expires
 * — foregrounding the app after being backgrounded will NOT trigger an
 * automatic refetch yet.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
