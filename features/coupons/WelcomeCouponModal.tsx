import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { BadgePercent, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useCart } from "@/context/CartContext";
import { useCoupon } from "@/context/CouponContext";
import { claimWelcomeCoupon, isCouponUsable } from "@/services/api/coupons";
import { setNudgeOverlayActive } from "@/features/overlays/overlayActivity";
import { useFirstLoginFlow } from "@/features/onboarding/useFirstLoginFlow";
import { useWelcomeCouponStatus } from "./useWelcomeCouponStatus";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * Welcome-coupon modal — STEP 2 of the first-login order
 * (ONBOARDING → WELCOME DISCOUNT → FILL PROFILE). Shown once per user,
 * after the first-run intro is done and before the profile prompt.
 *
 * Eligibility is unchanged and lives in useWelcomeCouponStatus: the
 * backend says no welcome coupon exists yet for the account (GET
 * /api/coupons has no source:"welcome" row), and a per-user AsyncStorage
 * flag stops the modal re-appearing once it has been answered OR
 * dismissed. "First login" is therefore decided by the backend's data,
 * not a local heuristic — an existing user reinstalling the app already
 * has the coupon row and never sees the modal. A dismissed user can still
 * claim later from Mina kuponger (the claim endpoint is idempotent, all
 * users eligible).
 *
 * WHEN it is allowed to open is not decided here — see useFirstLoginFlow.
 *
 * "Använd nu" claims + selects the coupon for checkout and continues to the
 * cart (if it has items) or the menu; "Lägg till i mina kuponger" only
 * claims.
 */

export function WelcomeCouponModal() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { items } = useCart();
  const { selectCoupon } = useCoupon();

  const [visible, setVisible] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(false);

  // Additive (patch 4 overlay control): report visibility so the
  // onboarding survey never shows while this modal is up. No show/defer
  // logic changed.
  useEffect(() => {
    setNudgeOverlayActive("welcomeCoupon", visible);
    return () => setNudgeOverlayActive("welcomeCoupon", false);
  }, [visible]);

  const { markHandled } = useWelcomeCouponStatus();

  /**
   * ── STEP 2 OF THREE ───────────────────────────────────────────────
   *
   * This modal does not decide when it appears. useFirstLoginFlow does,
   * for all three first-login steps at once:
   *
   *   onboarding       → the intro is still running; stay closed
   *   welcome-discount → our turn
   *   profile-prompt   → the discount is already dealt with
   *   loading          → something is unknown; show NOTHING
   *
   * Two things were wrong before, and they were opposite mistakes. The
   * modal originally consulted nothing at all, so a brand-new account
   * met a 20% discount before the app had asked it a single question.
   * The fix for that then over-corrected and made the discount wait for
   * a COMPLETE nutrition profile — which put step 2 after step 3 and is
   * how "Vill du ange din kostprofil nu?" came to be the very first
   * thing a new customer saw. The order is stated once now, in
   * firstLoginFlow.ts, and this component only obeys it.
   *
   * `step` already contains the eligibility rules (never prompted for
   * this account, and the backend holds no welcome coupon) — see
   * useWelcomeCouponStatus. No coupon state is invented to get here.
   */
  const { step } = useFirstLoginFlow();

  useEffect(() => {
    if (step === "welcome-discount") {
      setVisible(true);
    } else {
      setVisible(false);
      setClaimError(false);
    }
  }, [step]);

  const markPrompted = markHandled;

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
