import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import { useCart } from "@/context/CartContext";
import { useCoupon } from "@/context/CouponContext";
import {
  claimWelcomeCoupon,
  getMyCoupons,
  isCouponUsable,
  WELCOME_COUPON_SOURCE,
} from "@/services/api/coupons";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Welcome-coupon modal — shown once per user after login, when the backend
 * says no welcome coupon exists yet for the account (GET /api/coupons has no
 * source:"welcome" row). "First login" is therefore decided by the backend's
 * data, not a local heuristic: an existing user reinstalling the app already
 * has the coupon row and never sees the modal.
 *
 * A per-user AsyncStorage flag stops the modal from re-appearing after it
 * has been answered OR dismissed; a dismissed user can still claim later
 * from Mina kuponger (the claim endpoint is idempotent, all users eligible).
 *
 * "Använd nu" claims + selects the coupon for checkout and continues to the
 * cart (if it has items) or the menu; "Lägg till i mina kuponger" only
 * claims.
 */

/** Exported so the weekly-reward launch nudge (SpinNudgeSheet) can defer to
 * this modal: the nudge skips any launch where the welcome prompt hasn't
 * been answered yet, so two sheets never compete on first login. */
export const WELCOME_PROMPTED_KEY_PREFIX = "nutri-welcome-coupon-prompted:";

const PROMPTED_KEY_PREFIX = WELCOME_PROMPTED_KEY_PREFIX;

export function WelcomeCouponModal() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { items } = useCart();
  const { selectCoupon } = useCoupon();

  // null = flag not read yet; true/false = read.
  const [alreadyPrompted, setAlreadyPrompted] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(false);

  const userId = user?.id ?? null;

  // Read the per-user prompted flag whenever the signed-in user changes.
  useEffect(() => {
    setAlreadyPrompted(null);
    setVisible(false);
    setClaimError(false);
    if (!userId) return;
    let mounted = true;
    AsyncStorage.getItem(PROMPTED_KEY_PREFIX + userId)
      .then((v) => {
        if (mounted) setAlreadyPrompted(v === "1");
      })
      .catch(() => {
        // Can't read the flag — err on the quiet side and never prompt.
        if (mounted) setAlreadyPrompted(true);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const couponsQuery = useQuery({
    queryKey: ["coupons", userId],
    queryFn: getMyCoupons,
    enabled: !!userId && !authLoading && alreadyPrompted === false,
  });

  const hasWelcomeCoupon = couponsQuery.data?.some((c) => c.source === WELCOME_COUPON_SOURCE);

  // Open exactly once: flag says never prompted, fresh data says no coupon.
  useEffect(() => {
    if (alreadyPrompted === false && couponsQuery.isSuccess && hasWelcomeCoupon === false) {
      setVisible(true);
    }
  }, [alreadyPrompted, couponsQuery.isSuccess, hasWelcomeCoupon]);

  const markPrompted = async () => {
    setAlreadyPrompted(true);
    if (userId) {
      await AsyncStorage.setItem(PROMPTED_KEY_PREFIX + userId, "1").catch(() => {});
    }
  };

  const claim = async () => {
    const coupon = await claimWelcomeCoupon();
    await queryClient.invalidateQueries({ queryKey: ["coupons"] });
    return coupon;
  };

  const handleUseNow = async () => {
    if (claiming) return;
    setClaiming(true);
    setClaimError(false);
    try {
      const coupon = await claim();
      if (isCouponUsable(coupon)) selectCoupon(coupon);
      await markPrompted();
      setVisible(false);
      // Continue where using the coupon makes sense: checkout when the cart
      // already has items, otherwise the menu to start an order.
      router.navigate(items.length > 0 ? "/(tabs)/varukorg" : "/(tabs)/meny");
    } catch {
      setClaimError(true);
    } finally {
      setClaiming(false);
    }
  };

  const handleSaveForLater = async () => {
    if (claiming) return;
    setClaiming(true);
    setClaimError(false);
    try {
      await claim();
      await markPrompted();
      setVisible(false);
    } catch {
      setClaimError(true);
    } finally {
      setClaiming(false);
    }
  };

  const handleDismiss = async () => {
    if (claiming) return;
    // No claim — the coupon stays claimable from Mina kuponger.
    await markPrompted();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={handleDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable
            onPress={handleDismiss}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={t("coupon.welcomeDismiss")}
            hitSlop={8}
          >
            <X size={16} color="rgba(255,255,255,0.4)" />
          </Pressable>

          <View style={styles.iconWrap}>
            <BadgePercent size={26} color={colors.accent} strokeWidth={1.75} />
          </View>

          <ThemedText style={styles.title}>{t("coupon.welcomeTitle")}</ThemedText>
          <ThemedText style={styles.body}>{t("coupon.welcomeBody")}</ThemedText>

          {claimError ? (
            <ThemedText style={styles.errorText}>{t("coupon.welcomeClaimError")}</ThemedText>
          ) : null}

          <Pressable
            onPress={handleUseNow}
            disabled={claiming}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && !claiming && { backgroundColor: colors.accentHover },
              claiming && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.primaryButtonText}>{t("coupon.welcomeUseNow")}</ThemedText>
          </Pressable>
          <Pressable
            onPress={handleSaveForLater}
            disabled={claiming}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && !claiming && { backgroundColor: "rgba(255,255,255,0.08)" },
              claiming && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.secondaryButtonText}>
              {t("coupon.welcomeSaveForLater")}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[5],
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[6],
    paddingBottom: spacing[5],
  },
  closeButton: {
    position: "absolute",
    top: spacing[3],
    right: spacing[3],
    padding: spacing[1],
    zIndex: 1,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
    marginBottom: spacing[4],
  },
  title: {
    textAlign: "center",
    fontSize: 18,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
    marginBottom: spacing[2],
  },
  body: {
    textAlign: "center",
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing[5],
  },
  errorText: {
    textAlign: "center",
    fontSize: 12.5,
    color: "#f87171",
    marginBottom: spacing[3],
  },
  primaryButton: {
    height: 48,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontSize: 14.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  secondaryButton: {
    height: 48,
    marginTop: spacing[2],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: fontFamily.bodySemibold,
    color: "rgba(255,255,255,0.85)",
  },
});
