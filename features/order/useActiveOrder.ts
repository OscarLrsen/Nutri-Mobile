import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { getOrderById, type ApiOrder } from "@/services/api/orders";
import { STAMP_CARD_QUERY_ROOT } from "@/services/api/stampCardQueries";
import {
  isTerminal,
  toCustomerStatus,
  type CustomerStatus,
} from "@/features/order/orderStatusShared";
import {
  clearActiveOrderId,
  getActiveOrderIdSnapshot,
  subscribeActiveOrderId,
} from "@/utils/activeOrder";

/**
 * The one order currently in flight, readable from ANY screen.
 *
 * WHY THIS EXISTS. The order id has always been stored when checkout hands
 * over to the status screen — but nothing outside that screen ever read it,
 * so leaving the screen meant losing the order. This hook is the single
 * follow-the-order mechanism behind the banner on Home/Meny/Konto.
 *
 * Poll cadence is deliberately slower than the status screen's 5 s: the
 * banner is ambient awareness, not the primary view. Both share the
 * ["orders", id] cache key, so whichever polls next updates both.
 *
 * WHEN THE ORDER COMPLETES, this is also what makes the rest of the app
 * catch up without a restart: stamps, points, rewards and today's nutrition
 * are all written server-side on Delivered, so their queries are invalidated
 * once here — the stamp the kitchen just awarded appears even if the
 * customer never reopens the status screen.
 */
export function useActiveOrder() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // SUBSCRIBED, not read once. Hem/Meny/Profil stay mounted in the tab
  // navigator, so a one-shot read at mount answered "no order" forever — the
  // banner never appeared for an order placed later in the same session. The
  // store notifies on every write, so an already-rendered banner picks the
  // order up the moment checkout stores it.
  const stored = useSyncExternalStore(
    subscribeActiveOrderId,
    getActiveOrderIdSnapshot,
    getActiveOrderIdSnapshot,
  );
  const settled = stored !== undefined;
  const orderId = stored ?? null;

  const query = useQuery<ApiOrder, unknown>({
    queryKey: ["orders", orderId],
    queryFn: () => getOrderById(orderId!),
    enabled: !!user && !!orderId && settled,
    staleTime: 10_000,
    refetchInterval: (q) => {
      const data = q.state.data as ApiOrder | undefined;
      if (!data) return 15_000;
      return isTerminal(toCustomerStatus(data.status)) ? false : 15_000;
    },
    retry: 1,
  });

  const status: CustomerStatus | null = query.data
    ? toCustomerStatus(query.data.status)
    : null;

  // ── The order finished while we were watching ─────────────────────
  useEffect(() => {
    if (!orderId || !status || !isTerminal(status)) return;

    // Everything Delivered writes server-side becomes visible now.
    if (status === "completed") {
      void queryClient.invalidateQueries({ queryKey: [STAMP_CARD_QUERY_ROOT] });
      void queryClient.invalidateQueries({ queryKey: ["rewards"] });
      void queryClient.invalidateQueries({ queryKey: ["points"] });
      void queryClient.invalidateQueries({ queryKey: ["nutrition"] });
    }

    // Clearing the store is what removes the banner everywhere at once — no
    // local state to fall out of sync with the other mounted screens.
    void clearActiveOrderId();
  }, [orderId, status, queryClient]);

  const isActive = !!orderId && !!status && !isTerminal(status);

  return {
    order: isActive ? (query.data ?? null) : null,
    orderId: isActive ? orderId : null,
    status: isActive ? status : null,
    isActive,
  };
}
