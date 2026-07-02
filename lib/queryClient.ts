import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client. Defaults chosen for a food-truck ordering
 * app on a possibly-flaky connection (spec §21's "offline cache" gap):
 * short retry count (fail fast, let the UI show a retry action rather than
 * spin silently), no refetch-on-window-focus equivalent needed on native
 * (that's a web-only concept; RN's default behavior already refetches on
 * app foreground via NetInfo once @tanstack/react-query's RN integration
 * is wired — not yet added in this phase, see the "Open questions" note
 * left in this repo's own follow-up list).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
