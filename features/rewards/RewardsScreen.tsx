import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, CalendarClock, ChevronRight, Gift, Sparkles, Star } from "lucide-react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { EmptyState } from "@/components/feedback/EmptyState";
import { useAuth } from "@/services/auth/AuthProvider";
import {
  getMyRewards,
  getRewardStatus,
  getWheelSegments,
  spinRewardWheel,
  type ApiSpinResult,
  type ApiUserReward,
} from "@/services/api/rewards";
import type { ApiError } from "@/types/api";
import { rewardsCopy as copy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { RewardWheel } from "./RewardWheel";
import { SpinResultModal } from "./SpinResultModal";
import { countdownParts, REWARD_STATUS_COLORS, rewardMetaLine } from "./rewardFormat";

/**
 * Veckans Belöning — the weekly reward wheel screen. Composition:
 *   1. Points summary (balance + active-rewards count, one /status call)
 *   2. Weekly reward: the wheel + spin CTA when canSpin, otherwise the
 *      come-back card with a live countdown to nextSpinAt
 *   3. Mina belöningar (GET /mine) — coupon rewards open the EXISTING
 *      /kupong/[id] detail screen (no duplicated coupon UI)
 *
 * Spin flow: pressing Snurra fires POST /spin immediately — the backend
 * decides the outcome while the wheel animates. When the response lands the
 * wheel decelerates; only after it settles does the result modal appear.
 * The client NEVER determines the reward.
 */

function StatusBadge({ status }: { status: string }) {
  const cfg = REWARD_STATUS_COLORS[status] ?? REWARD_STATUS_COLORS.Redeemed;
  const label = copy.statusNames[status] ?? status;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <ThemedText style={[styles.statusBadgeText, { color: cfg.color }]}>{label}</ThemedText>
    </View>
  );
}

function SectionHead({ label }: { label: string }) {
  return <ThemedText style={styles.sectionHead}>{label}</ThemedText>;
}

function RewardsHero({ available, busy }: { available: boolean; busy: boolean }) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroBadge}>
        <Sparkles size={14} color="#FFC178" strokeWidth={2.2} />
        <ThemedText style={styles.heroEyebrow}>{copy.weeklySectionHead}</ThemedText>
      </View>
      <ThemedText style={styles.heroTitle}>{copy.screenTitle}</ThemedText>
      <ThemedText style={styles.heroBody}>
        {busy ? copy.spinning : available ? copy.spinSubtitle : copy.comeBackTitle}
      </ThemedText>
    </View>
  );
}

function SpinButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.spinButtonShell,
        pressed && !busy && styles.spinButtonPressed,
        busy && styles.spinButtonBusy,
      ]}
      accessibilityRole="button"
      accessibilityLabel={busy ? copy.spinning : copy.spinCta}
      accessibilityHint="Snurrar hjulet och visar serverns belöning"
      accessibilityState={{ disabled: busy, busy }}
    >
      <View style={styles.spinButtonDepth} />
      <LinearGradient
        colors={busy ? ["#8E431A", "#6E3114"] : ["#FF9A43", colors.accent, "#C74605"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.spinButtonFace}
      >
        {busy ? (
          <View style={styles.spinBusyDot} />
        ) : (
          <Gift size={18} color="#FFF8EE" strokeWidth={2.2} />
        )}
        <ThemedText style={styles.spinButtonText}>{busy ? copy.spinning : copy.spinCta}</ThemedText>
        {!busy ? <Sparkles size={15} color="#FFE0B8" strokeWidth={2.2} /> : null}
      </LinearGradient>
    </Pressable>
  );
}

// ── Section 0: points summary ────────────────────────────────────────────

function PointsCard({ balance, activeRewards }: { balance: number; activeRewards: number }) {
  return (
    <View style={styles.pointsCard}>
      <View style={styles.pointsIconWrap}>
        <Star size={20} color={colors.accent} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.pointsLabel}>{copy.pointsLabel}</ThemedText>
        <ThemedText style={styles.pointsValue}>{balance}</ThemedText>
      </View>
      <ThemedText style={styles.pointsActive}>{copy.activeRewardsLabel(activeRewards)}</ThemedText>
    </View>
  );
}

// ── Section 1: the wheel / come-back card ────────────────────────────────

function CountdownCard({ nextSpinAt }: { nextSpinAt: string }) {
  // Minute-resolution tick keeps the countdown live without burning renders.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { d, h, m } = countdownParts(nextSpinAt);
  const label = d >= 1 ? copy.daysLeft(h > 0 || m > 0 ? d + 1 : d) : copy.countdown(0, h, m);

  return (
    <View style={styles.comeBackCard}>
      <View style={styles.comeBackIconWrap}>
        <CalendarClock size={22} color={colors.accent} strokeWidth={1.75} />
      </View>
      <ThemedText style={styles.comeBackTitle}>{copy.comeBackTitle}</ThemedText>
      <View style={styles.countdownChip}>
        <ThemedText style={styles.countdownText}>
          {copy.nextSpinLabel} · {label}
        </ThemedText>
      </View>
    </View>
  );
}

// ── Section 2: my rewards ────────────────────────────────────────────────

function RewardCard({ reward }: { reward: ApiUserReward }) {
  const router = useRouter();
  const isOpenableCoupon = reward.rewardType === "Coupon" && !!reward.couponId;
  const inactive = reward.status !== "Unused";

  const card = (
    <View style={[styles.rewardCard, inactive && { opacity: 0.55 }]}>
      <View style={styles.rewardIconWrap}>
        <ThemedText style={styles.rewardIcon}>{reward.icon || "🎁"}</ThemedText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rewardTitleRow}>
          <ThemedText style={styles.rewardTitle} numberOfLines={1}>
            {reward.title}
          </ThemedText>
          <StatusBadge status={reward.status} />
        </View>
        <ThemedText style={styles.rewardMeta}>{rewardMetaLine(reward)}</ThemedText>
        {isOpenableCoupon ? (
          <ThemedText style={styles.rewardOpenHint}>{copy.openCoupon}</ThemedText>
        ) : null}
      </View>
      {isOpenableCoupon ? <ChevronRight size={15} color="rgba(255,255,255,0.3)" /> : null}
    </View>
  );

  if (!isOpenableCoupon) return card;
  return (
    <Pressable
      onPress={() => router.push(`/kupong/${reward.couponId}`)}
      style={({ pressed }) => pressed && { opacity: 0.8 }}
      accessibilityRole="button"
      accessibilityLabel={`${reward.title}, ${copy.openCoupon}`}
    >
      {card}
    </Pressable>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────

export function RewardsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const { user, loading: authLoading } = useAuth();

  const statusQuery = useQuery({
    queryKey: ["rewards", "status", user?.id ?? null],
    queryFn: getRewardStatus,
    enabled: !!user,
  });
  const mineQuery = useQuery({
    queryKey: ["rewards", "mine", user?.id ?? null],
    queryFn: getMyRewards,
    enabled: !!user,
  });
  const wheelQuery = useQuery({
    queryKey: ["rewards", "wheel", user?.id ?? null],
    queryFn: getWheelSegments,
    enabled: !!user,
  });

  // Spin state machine: idle → spinning (request in flight, wheel turning)
  // → settling (response landed, wheel decelerating) → modal.
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [spinBusy, setSpinBusy] = useState(false);
  const [spinErrorText, setSpinErrorText] = useState<string | null>(null);
  const [targetSegmentId, setTargetSegmentId] = useState<string | null>(null);
  const pendingResult = useRef<ApiSpinResult | null>(null);
  const [modalResult, setModalResult] = useState<ApiSpinResult | null>(null);
  // State updates can lag one tap behind; the ref closes that tiny window so
  // two rapid presses can never issue two POST /spin requests.
  const spinLock = useRef(false);
  const mounted = useRef(true);
  const focusEnergy = useSharedValue(0);

  const scrollRef = useRef<ScrollView>(null);
  const mineSectionY = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    focusEnergy.value = withTiming(spinBusy ? 1 : 0, {
      duration: reducedMotion ? 100 : spinBusy ? 260 : 380,
    });
  }, [focusEnergy, reducedMotion, spinBusy]);

  const surroundingStyle = useAnimatedStyle(() => ({
    opacity: 1 - focusEnergy.value * 0.42,
  }));
  const wheelStageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + focusEnergy.value * (reducedMotion ? 0.005 : 0.018) }],
  }));

  const invalidateRewardData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["rewards"] });
    // A coupon win minted a real Coupon row — the coupon list/cart must see it.
    queryClient.invalidateQueries({ queryKey: ["coupons"] });
  }, [queryClient]);

  const handleSpin = async () => {
    if (spinLock.current || spinBusy) return;
    spinLock.current = true;
    Haptics.selectionAsync().catch(() => {});
    setSpinBusy(true);
    setSpinErrorText(null);
    setTargetSegmentId(null);
    setWheelSpinning(true);
    try {
      const result = await spinRewardWheel();
      if (!mounted.current) {
        invalidateRewardData();
        return;
      }
      pendingResult.current = result;
      setTargetSegmentId(result.weeklyRewardId);
    } catch (err) {
      if (!mounted.current) return;
      const apiErr = err as ApiError;
      pendingResult.current = null;
      if (apiErr.status === 409) {
        setSpinErrorText(copy.alreadySpun);
        statusQuery.refetch();
      } else if (apiErr.status === 503) {
        setSpinErrorText(copy.wheelUnavailable);
      } else if (apiErr.status === 0) {
        setSpinErrorText(apiErr.message); // Offline copy from the client.
      } else {
        setSpinErrorText(copy.spinError);
      }
    } finally {
      // Either way the wheel decelerates; the modal only opens when a
      // result is pending (see handleWheelSettled).
      if (mounted.current) setWheelSpinning(false);
    }
  };

  const handleWheelSettled = useCallback(() => {
    spinLock.current = false;
    setSpinBusy(false);
    if (pendingResult.current) {
      setModalResult(pendingResult.current);
      pendingResult.current = null;
      invalidateRewardData();
    }
  }, [invalidateRewardData]);

  const closeModal = () => setModalResult(null);
  const showMyRewards = () => {
    setModalResult(null);
    scrollRef.current?.scrollTo({ y: mineSectionY.current - spacing[4], animated: true });
  };

  const status = statusQuery.data;
  const wheelSize = Math.min(304, Math.max(212, screenWidth - 88));
  const entering = (index: number) =>
    reducedMotion ? undefined : FadeInDown.delay(index * 50).duration(280);

  return (
    <Screen edges={["top", "bottom"]}>
      {/* Back header — same pattern as CouponListScreen/OrderStatusScreen */}
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"))}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Tillbaka"
          hitSlop={8}
        >
          <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{copy.screenTitle}</ThemedText>
        <View style={styles.backButton} />
      </View>

      {authLoading ? (
        <View style={styles.skeletons}>
          <Skeleton height={76} />
          <Skeleton height={280} />
          <Skeleton height={72} />
        </View>
      ) : !user ? (
        <View style={styles.center}>
          <ThemedText style={styles.loginText}>{copy.loginRequired}</ThemedText>
          <Pressable
            onPress={() => router.push({ pathname: "/logga-in", params: { next: "/beloningar" } })}
            style={({ pressed }) => [
              styles.primaryButton,
              { alignSelf: "center", paddingHorizontal: spacing[6] },
              pressed && { backgroundColor: colors.accentHover },
            ]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.primaryButtonText}>{copy.loginCta}</ThemedText>
          </Pressable>
        </View>
      ) : statusQuery.isLoading ? (
        <View style={styles.skeletons}>
          <Skeleton height={76} />
          <Skeleton height={280} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : statusQuery.isError ? (
        <View style={styles.center}>
          <ThemedText style={styles.errorText}>{copy.fetchError}</ThemedText>
          <Pressable
            onPress={() => statusQuery.refetch()}
            style={styles.retryButton}
            accessibilityRole="button"
          >
            <ThemedText style={styles.retryText}>{copy.retry}</ThemedText>
          </Pressable>
        </View>
      ) : status ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={entering(0)} style={surroundingStyle}>
            <RewardsHero available={status.canSpin} busy={spinBusy} />
          </Animated.View>

          {/* ── Weekly reward ── */}
          <Animated.View entering={entering(1)} style={wheelStageStyle}>
            <View style={[styles.wheelCard, spinBusy && styles.wheelCardFocused]}>
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(232,101,10,0.22)", "rgba(45,24,16,0.34)", "rgba(20,16,14,0.1)"]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={styles.spotlightTop} />
              <View style={styles.stageLabelRow}>
                <View style={[styles.liveDot, !status.canSpin && styles.liveDotInactive]} />
                <ThemedText style={styles.stageLabel}>
                  {status.canSpin || spinBusy ? "REDO ATT SNURRA" : "NÄSTA CHANS LADDAR"}
                </ThemedText>
              </View>
              <View style={styles.wheelPad}>
                <RewardWheel
                  segments={wheelQuery.data ?? []}
                  spinning={wheelSpinning}
                  active={status.canSpin}
                  targetSegmentId={targetSegmentId}
                  size={wheelSize}
                  onSettled={handleWheelSettled}
                />
              </View>

              {status.canSpin || spinBusy ? (
                <View style={styles.spinControls}>
                 <ThemedText style={styles.wheelSubtitle}>{copy.spinSubtitle}</ThemedText>
                 {spinErrorText ? (
                   <ThemedText style={styles.errorText}>{spinErrorText}</ThemedText>
                 ) : null}
                  <SpinButton busy={spinBusy} onPress={handleSpin} />
                </View>
              ) : status.nextSpinAt ? (
                <CountdownCard nextSpinAt={status.nextSpinAt} />
              ) : (
                <View style={styles.comeBackCard}>
                  <ThemedText style={styles.comeBackTitle}>{copy.wheelUnavailable}</ThemedText>
                </View>
              )}
            </View>
          </Animated.View>

          {/* ── Points summary ── */}
          <Animated.View entering={entering(2)} style={surroundingStyle}>
            <PointsCard balance={status.pointsBalance} activeRewards={status.activeRewards} />
          </Animated.View>

          {/* ── My rewards ── */}
          <Animated.View
            entering={entering(3)}
            style={surroundingStyle}
            onLayout={(e) => {
              mineSectionY.current = e.nativeEvent.layout.y;
            }}
          >
            <SectionHead label={copy.mineSectionHead} />
            {mineQuery.isLoading ? (
              <View style={{ gap: spacing[3] }}>
                <Skeleton height={72} />
                <Skeleton height={72} />
              </View>
            ) : mineQuery.isError ? (
              <InlineError text={copy.mineFetchError} onRetry={() => mineQuery.refetch()} />
            ) : mineQuery.data && mineQuery.data.length > 0 ? (
              <View style={{ gap: spacing[3] }}>
                {mineQuery.data.map((reward) => (
                  <RewardCard key={reward.id} reward={reward} />
                ))}
              </View>
            ) : (
              <EmptyState message={copy.mineEmpty} />
            )}
          </Animated.View>

        </ScrollView>
      ) : null}

      <SpinResultModal result={modalResult} onClose={closeModal} onShowRewards={showMyRewards} />
    </Screen>
  );
}

function InlineError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={styles.inlineError}>
      <ThemedText style={styles.errorText}>{text}</ThemedText>
      <Pressable onPress={onRetry} style={styles.retryButton} accessibilityRole="button">
        <ThemedText style={styles.retryText}>{copy.retry}</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  content: { padding: spacing[4], paddingBottom: spacing[8], gap: spacing[5] },
  skeletons: { padding: spacing[4], gap: spacing[4] },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[4],
    padding: spacing[6],
  },

  sectionHead: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginBottom: spacing[3],
  },

  hero: {
    alignItems: "center",
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    gap: spacing[2],
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    backgroundColor: "rgba(232,101,10,0.11)",
    borderWidth: 1,
    borderColor: "rgba(255,171,92,0.22)",
  },
  heroEyebrow: {
    fontSize: 10.5,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.45,
    color: "#FFC178",
  },
  heroTitle: {
    marginTop: spacing[1],
    fontSize: 29,
    lineHeight: 35,
    fontFamily: fontFamily.headlineExtrabold,
    letterSpacing: -1.1,
    color: colors.textPrimary,
    textAlign: "center",
  },
  heroBody: {
    maxWidth: 330,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: "center",
  },

  pointsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
    borderRadius: radius.card,
    padding: spacing[4],
  },
  pointsIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
  },
  pointsLabel: { fontSize: 11.5, color: colors.textTertiary },
  pointsValue: {
    fontSize: 22,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  pointsActive: { fontSize: 11.5, color: colors.textTertiary },

  wheelCard: {
    overflow: "hidden",
    backgroundColor: "#181411",
    borderWidth: 1,
    borderColor: "rgba(255,153,67,0.25)",
    borderRadius: 20,
    padding: spacing[4],
    gap: spacing[4],
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  wheelCardFocused: {
    borderColor: "rgba(255,166,82,0.5)",
  },
  spotlightTop: {
    position: "absolute",
    top: -110,
    alignSelf: "center",
    width: 270,
    height: 220,
    borderRadius: 135,
    backgroundColor: "rgba(255,144,48,0.1)",
  },
  stageLabelRow: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: "rgba(9,8,7,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF9841",
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
  liveDotInactive: {
    backgroundColor: "rgba(255,255,255,0.28)",
    shadowOpacity: 0,
  },
  stageLabel: {
    fontSize: 9.5,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.25,
    color: "rgba(255,232,208,0.72)",
  },
  wheelPad: {
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
  },
  spinControls: {
    gap: spacing[3],
  },
  wheelSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
  spinButtonShell: {
    alignSelf: "stretch",
    height: 58,
    borderRadius: 15,
    transform: [{ translateY: 0 }, { scale: 1 }],
  },
  spinButtonPressed: {
    transform: [{ translateY: 3 }, { scale: 0.985 }],
  },
  spinButtonBusy: {
    opacity: 0.72,
  },
  spinButtonDepth: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -4,
    height: 56,
    borderRadius: 15,
    backgroundColor: "#7A2906",
  },
  spinButtonFace: {
    flex: 1,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    borderWidth: 1,
    borderColor: "rgba(255,231,204,0.38)",
    shadowColor: colors.accent,
    shadowOpacity: 0.38,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  spinButtonText: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 0.2,
    color: "#FFF8EE",
  },
  spinBusyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFD4A3",
  },
  primaryButton: {
    height: 46,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },

  comeBackCard: {
    backgroundColor: "rgba(10,9,8,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: radius.card,
    padding: spacing[4],
    alignItems: "center",
    gap: spacing[3],
  },
  comeBackIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
  },
  comeBackTitle: {
    fontSize: 13.5,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
    textAlign: "center",
  },
  countdownChip: {
    borderRadius: 999,
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
  },
  countdownText: { fontSize: 12, fontFamily: fontFamily.bodySemibold, color: colors.accent },

  rewardCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  rewardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
  },
  rewardIcon: { fontSize: 18, lineHeight: 24 },
  rewardTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  rewardTitle: {
    flexShrink: 1,
    fontSize: 13.5,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
  },
  rewardMeta: { marginTop: 2, fontSize: 11.5, color: colors.textTertiary },
  rewardOpenHint: { marginTop: 2, fontSize: 11.5, color: colors.accent },

  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10.5, fontFamily: fontFamily.bodySemibold },

  loginText: { fontSize: 13.5, color: colors.textSecondary, textAlign: "center" },
  errorText: { fontSize: 12.5, color: "#f87171", textAlign: "center" },
  inlineError: { alignItems: "center", gap: spacing[3], paddingVertical: spacing[4] },
  retryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.35)",
    backgroundColor: "rgba(232,101,10,0.12)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  retryText: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: colors.accent },
});
