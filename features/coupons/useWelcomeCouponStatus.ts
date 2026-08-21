import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/AuthProvider";
import { getMyCoupons, WELCOME_COUPON_SOURCE } from "@/services/api/coupons";

/** Exported so the weekly-reward launch nudge (SpinNudgeSheet) can defer to
 * the welcome modal: the nudge skips any launch where the welcome prompt
 * hasn't been answered yet, so two sheets never compete on first login. */
export const WELCOME_PROMPTED_KEY_PREFIX = "nutri-welcome-coupon-prompted:";

/**
 * "Has this customer dealt with the welcome discount?" — the real
 * handled/seen semantics, in one place.
 *
 * Both halves of the existing product rule are kept exactly as they were,
 * because they answer different questions:
 *
 *   the per-user AsyncStorage flag → have we ASKED this account yet?
 *   the backend coupons list       → does the account already OWN it?
 *
 * The second is what makes a reinstall safe: an existing customer whose
 * local flag is gone still has the coupon row, so they are never
 * re-welcomed. No state is invented here — nothing writes a coupon, and
 * nothing claims one, just to move the flow along.
 *
 * ── FAIL FORWARD, NOT FAIL SILENT ────────────────────────────────────
 *
 * `null` means "not known yet" and holds the whole first-login sequence,
 * so it must be a genuinely transient state. Both failure modes therefore
 * resolve to `true` (handled → skip step 2):
 *
 *   storage read fails  → never prompt (pre-existing behaviour)
 *   coupons request fails → skip the discount this launch
 *
 * Erring the other way would show a discount we cannot verify. Erring
 * this way costs the customer nothing — the coupon stays claimable from
 * Mina kuponger, the prompt returns on the next launch, and step 3 is not
 * held hostage to a failed request.
 */
export type WelcomeCouponStatus = {
  /** null = not known yet. true = asked, owned, or unverifiable. */
  handled: boolean | null;
  /** The backend already holds a welcome coupon for this account. */
  hasWelcomeCoupon: boolean | undefined;
  /** Record that the customer has been asked. Flips `handled` at once. */
  markHandled: () => Promise<void>;
};

export function useWelcomeCouponStatus(): WelcomeCouponStatus {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  // null = flag not read yet; true/false = read.
  const [prompted, setPrompted] = useState<boolean | null>(null);

  // Re-read the per-user flag whenever the signed-in user changes, so a
  // second account on the same device gets its own answer.
  useEffect(() => {
    setPrompted(null);
    if (!userId) return;
    let mounted = true;
    AsyncStorage.getItem(WELCOME_PROMPTED_KEY_PREFIX + userId)
      .then((v) => {
        if (mounted) setPrompted(v === "1");
      })
      .catch(() => {
        // Can't read the flag — err on the quiet side and never prompt.
        if (mounted) setPrompted(true);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  // Unchanged network shape: only fetched when we might actually prompt.
  // Shared row — the modal and the flow machine are two observers of the
  // same query, so consulting it in both places costs nothing.
  const couponsQuery = useQuery({
    queryKey: ["coupons", userId],
    queryFn: getMyCoupons,
    enabled: !!userId && !authLoading && prompted === false,
  });

  const hasWelcomeCoupon = couponsQuery.data?.some((c) => c.source === WELCOME_COUPON_SOURCE);

  let handled: boolean | null = null;
  if (userId && prompted !== null) {
    if (prompted) handled = true;
    else if (couponsQuery.isError) handled = true;
    else if (couponsQuery.isSuccess) handled = hasWelcomeCoupon === true;
  }

  const markHandled = useCallback(async () => {
    setPrompted(true);
    if (userId) {
      await AsyncStorage.setItem(WELCOME_PROMPTED_KEY_PREFIX + userId, "1").catch(() => {});
    }
  }, [userId]);

  return { handled, hasWelcomeCoupon, markHandled };
}
