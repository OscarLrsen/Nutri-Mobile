import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ChevronRight, Star } from "lucide-react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { EmptyState } from "@/components/feedback/EmptyState";
import { useAuth } from "@/services/auth/AuthProvider";
import {
  getMyRewards,
  getRewardHistory,
  getRewardStatus,
  getWheelSegments,
  spinRewardWheel,
  type ApiRewardHistoryEntry,
  type ApiSpinResult,
  type ApiUserReward,
} from "@/services/api/rewards";
import type { ApiError } from "@/types/api";
import { rewardsCopy as copy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { RewardWheel } from "./RewardWheel";
import { SpinResultModal } from "./SpinResultModal";
import {
  countdownParts,
  formatRewardDate,
  REWARD_STATUS_COLORS,
  rewardMetaLine,
} from "./rewardFormat";

/**
 * Veckans Belöning — the weekly reward wheel screen. Composition:
 *   1. Points summary (balance + active-rewards count, one /status call)
 *   2. Weekly reward: the wheel + spin CTA when canSpin, otherwise the
 *      come-back card with a live countdown to nextSpinAt
 *   3. Mina belöningar (GET /mine) — coupon rewards open the EXISTING
 *      /kupong/[id] detail screen (no duplicated coupon UI)
 *   4. Historik (GET /history) — timeline, newest first (server-sorted)
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

// ── Section 3: history timeline ──────────────────────────────────────────

function HistoryRow({ entry, isLast }: { entry: ApiRewardHistoryEntry; isLast: boolean }) {
  const noWin = entry.resultType === "NoReward";
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyRail}>
        <View style={[styles.historyDot, noWin && styles.historyDotMuted]} />
        {!isLast ? <View style={styles.historyLine} /> : null}
      </View>
      <View style={styles.historyBody}>
        <ThemedText style={styles.historyDate}>{formatRewardDate(entry.spunAt)}</ThemedText>
        <View style={styles.historyTitleRow}>
          <ThemedText style={styles.historyIcon}>{entry.icon || (noWin ? "😔" : "🎁")}</ThemedText>
          <ThemedText style={[styles.historyTitle, noWin && { color: colors.textTertiary }]}>
            {noWin ? copy.historyNoWin : entry.title}
          </ThemedText>
          {entry.rewardStatus ? <StatusBadge status={entry.rewardStatus} /> : null}
        </View>
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────

export function RewardsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
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
  const historyQuery = useQuery({
    queryKey: ["rewards", "history", user?.id ?? null],
    queryFn: getRewardHistory,
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

  const scrollRef = useRef<ScrollView>(null);
  const mineSectionY = useRef(0);

  const invalidateRewardData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["rewards"] });
    // A coupon win minted a real Coupon row — the coupon list/cart must see it.
    queryClient.invalidateQueries({ queryKey: ["coupons"] });
  }, [queryClient]);

  const handleSpin = async () => {
    if (spinBusy) return;
    setSpinBusy(true);
    setSpinErrorText(null);
    setWheelSpinning(true);
    try {
      const result = await spinRewardWheel();
      pendingResult.current = result;
      setTargetSegmentId(result.weeklyRewardId);
    } catch (err) {
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
      setWheelSpinning(false);
    }
  };

  const handleWheelSettled = useCallback(() => {
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
          {/* ── Points summary ── */}
          <Animated.View entering={entering(0)}>
            <PointsCard balance={status.pointsBalance} activeRewards={status.activeRewards} />
          </Animated.View>

          {/* ── Weekly reward ── */}
          <Animated.View entering={entering(1)}>
            <SectionHead label={copy.weeklySectionHead} />
            {status.canSpin || spinBusy ? (
              <View style={styles.wheelCard}>
                <RewardWheel
                  segments={wheelQuery.data ?? []}
                  spinning={wheelSpinning}
                  targetSegmentId={targetSegmentId}
                  onSettled={handleWheelSettled}
                />
                <ThemedText style={styles.wheelSubtitle}>{copy.spinSubtitle}</ThemedText>
                {spinErrorText ? (
                  <ThemedText style={styles.errorText}>{spinErrorText}</ThemedText>
                ) : null}
                <Pressable
                  onPress={handleSpin}
                  disabled={spinBusy}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.spinButton,
                    pressed && !spinBusy && { backgroundColor: colors.accentHover },
                    spinBusy && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: spinBusy }}
                >
                  <ThemedText style={styles.primaryButtonText}>
                    {spinBusy ? copy.spinning : copy.spinCta}
                  </ThemedText>
                </Pressable>
              </View>
            ) : status.nextSpinAt ? (
              <CountdownCard nextSpinAt={status.nextSpinAt} />
            ) : (
              <View style={styles.comeBackCard}>
                <ThemedText style={styles.comeBackTitle}>{copy.wheelUnavailable}</ThemedText>
              </View>
            )}
          </Animated.View>

          {/* ── My rewards ── */}
          <Animated.View
            entering={entering(2)}
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

          {/* ── History ── */}
          <Animated.View entering={entering(3)}>
            <SectionHead label={copy.historySectionHead} />
            {historyQuery.isLoading ? (
              <View style={{ gap: spacing[3] }}>
                <Skeleton height={48} />
                <Skeleton height={48} />
              </View>
            ) : historyQuery.isError ? (
              <InlineError text={copy.historyFetchError} onRetry={() => historyQuery.refetch()} />
            ) : historyQuery.data && historyQuery.data.length > 0 ? (
              <View style={styles.historyCard}>
                {historyQuery.data.map((entry, i) => (
                  <HistoryRow
                    key={entry.spinId}
                    entry={entry}
                    isLast={i === historyQuery.data.length - 1}
                  />
                ))}
              </View>
            ) : (
              <EmptyState message={copy.historyEmpty} />
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing[5],
    gap: spacing[4],
  },
  wheelSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
  spinButton: { alignSelf: "stretch" },
  primaryButton: {
    height: 46,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },

  comeBackCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing[6],
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

  historyCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  historyRow: { flexDirection: "row", gap: spacing[3] },
  historyRail: { alignItems: "center", width: 12 },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 5,
  },
  historyDotMuted: { backgroundColor: "rgba(255,255,255,0.22)" },
  historyLine: { flex: 1, width: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 3 },
  historyBody: { flex: 1, paddingBottom: spacing[4] },
  historyDate: { fontSize: 11, color: colors.textMuted },
  historyTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginTop: 3 },
  historyIcon: { fontSize: 14, lineHeight: 18 },
  historyTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
  },

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
