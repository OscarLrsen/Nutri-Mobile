import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/services/auth/AuthProvider";
import { configureNotificationHandling } from "@/services/push/pushNotifications";

/**
 * App-level notification plumbing (patch 10) — renders nothing.
 *
 * - Tap on a push → deep link, STRICTLY from an allowlist of `data.type`
 *   values the backend actually sends; anything else is ignored, so a
 *   malformed/foreign payload can never navigate the app anywhere odd.
 * - Cold start via a push is covered by getLastNotificationResponseAsync
 *   (the tap listener isn't mounted yet at that point).
 * - Deep links only navigate the Stack UNDER the app-wide overlays: the
 *   consent gate / first-run intro / survey mount above it in _layout, so
 *   a push tap can never bypass them.
 * - A foreground order-ready push refreshes the order query, so a user
 *   already looking at their order sees "ready" immediately.
 */

// Order ids are GUIDs (backend sends order.Id.ToString()); the /order/[id]
// screen fetches GET /api/orders/{id:guid}, which enforces ownership
// server-side (JWT e-mail must match the order's customer e-mail).
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** null = not a link we recognise → do nothing. */
function routeForPush(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, orderId } = data as { type?: unknown; orderId?: unknown };
  if (type === "order-ready") {
    return typeof orderId === "string" && GUID_PATTERN.test(orderId) ? `/order/${orderId}` : null;
  }
  if (type === "weekly-rewards") return "/beloningar";
  if (type === "profile-reminder") return "/(tabs)/konto";
  return null;
}

// Cold-start response is also re-delivered to the tap listener on some
// platforms — remember handled notification ids so a tap navigates once.
const handledResponseIds = new Set<string>();

// Auth snapshot for the module-level tap handler (patch 11 auth gate):
// the component below mirrors useAuth() into this variable. When signed
// out, a push deep link routes VIA login with the destination as the
// `next` param — an app-internal path from our own allowlist, which
// LoginScreen only follows when it starts with "/" (never an external
// URL). ConsentGate/intro/survey overlays still sit above whatever the
// login lands on, so the gate order is preserved.
let signedInSnapshot = false;

function navigate(route: string): void {
  if (signedInSnapshot) {
    router.push(route as never);
  } else {
    router.replace({ pathname: "/logga-in", params: { next: route } });
  }
}

function handleResponse(response: Notifications.NotificationResponse): void {
  const id = response.notification.request.identifier;
  if (handledResponseIds.has(id)) return;
  handledResponseIds.add(id);

  const route = routeForPush(response.notification.request.content.data);
  if (!route) return;
  try {
    navigate(route);
  } catch {
    // Router not ready yet (cold start) — one delayed retry, then give up:
    // the user is still inside the app, just not auto-navigated.
    setTimeout(() => {
      try {
        navigate(route);
      } catch {
        // Give up silently.
      }
    }, 700);
  }
}

export function PushNotificationResponder() {
  const { user, loading } = useAuth();
  useEffect(() => {
    signedInSnapshot = !!user;
  }, [user]);

  useEffect(() => {
    // Wait until the session state is KNOWN before processing the
    // cold-start response — otherwise a signed-in user's push tap would
    // route via login unnecessarily. `loading` resolves exactly once.
    if (loading) return;
    configureNotificationHandling();

    let cancelled = false;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!cancelled && response) handleResponse(response);
      })
      .catch(() => {});

    const tapSub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as { type?: unknown; orderId?: unknown };
      if (data?.type === "order-ready" && typeof data.orderId === "string") {
        queryClient
          .invalidateQueries({ queryKey: ["orders", data.orderId] })
          .catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      tapSub.remove();
      receivedSub.remove();
    };
  }, [loading]);

  return null;
}
