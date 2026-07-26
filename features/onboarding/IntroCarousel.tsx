import { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ShoppingBag, Smartphone, Target, type LucideIcon } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * The three-screen "what is Nutri" intro (patch 3) — ONE shared carousel
 * for both surfaces:
 * - first-run: rendered by FirstRunOnboardingGate above the app until the
 *   user skips or finishes ("Explore without an account" → the existing
 *   signed-out app; browsing needs no account, ordering asks for one
 *   later, so no new guest/checkout mode exists here).
 * - replay: rendered by the /om-nutri route (opened from Profile); the
 *   final button reads "Done" and onFinish simply navigates back — replay
 *   never touches the first-run flag or auth state.
 *
 * Interaction: swipe AND buttons. The current page is tracked from
 * momentum-end (swipes) and set optimistically on Next (so rapid taps can
 * never double-advance), and the finish action is guarded by a ref so the
 * last step can never fire twice. Skip is available on every page.
 */

type Props = {
  mode: "first-run" | "replay";
  /** Called exactly once when the user skips or completes the intro. */
  onFinish: () => void;
};

type IntroPage = {
  key: string;
  Icon: LucideIcon;
  title: string;
  body: string;
};

export function IntroCarousel({ mode, onFinish }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<IntroPage>>(null);
  const [page, setPage] = useState(0);
  const finishedRef = useRef(false);

  const pages: IntroPage[] = [
    { key: "goals", Icon: Target, title: t("onboarding.s1Title"), body: t("onboarding.s1Body") },
    { key: "order", Icon: Smartphone, title: t("onboarding.s2Title"), body: t("onboarding.s2Body") },
    { key: "pickup", Icon: ShoppingBag, title: t("onboarding.s3Title"), body: t("onboarding.s3Body") },
  ];
  const lastIndex = pages.length - 1;
  const isLast = page === lastIndex;

  const finish = () => {
    if (finishedRef.current) return; // Last step can never trigger twice.
    finishedRef.current = true;
    onFinish();
  };

  const goNext = () => {
    if (isLast) {
      finish();
      return;
    }
    const next = Math.min(page + 1, lastIndex);
    listRef.current?.scrollToIndex({ index: next, animated: true });
    // Optimistic — a second rapid tap sees the updated page and cannot
    // over-advance past what scrollToIndex was asked for.
    setPage(next);
  };

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setPage(Math.max(0, Math.min(index, lastIndex)));
  };

  return (
    <Screen edges={["top", "bottom"]}>
      {/* Top row: skip — reachable from every page. */}
      <View style={styles.topRow}>
        <View style={styles.topSpacer} />
        <Pressable
          onPress={finish}
          style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.skip")}
          hitSlop={8}
        >
          <ThemedText style={styles.skipText}>{t("onboarding.skip")}</ThemedText>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => (
          <View style={[styles.page, { width }]}>
            {/* Decorative — the heading/body carry the meaning. */}
            <View
              style={styles.iconTile}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <item.Icon size={30} color={colors.accent} strokeWidth={1.6} />
            </View>
            <ThemedText accessibilityRole="header" style={styles.title}>
              {item.title}
            </ThemedText>
            <ThemedText style={styles.body}>{item.body}</ThemedText>
          </View>
        )}
      />

      <View style={styles.footer}>
        {/* Page indicator — one accessibility element with a real label. */}
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={t("onboarding.pageIndicator", {
            current: page + 1,
            total: pages.length,
          })}
        >
          {pages.map((item, index) => (
            <View key={item.key} style={[styles.dot, index === page && styles.dotActive]} />
          ))}
        </View>

        <Button
          label={
            isLast
              ? mode === "replay"
                ? t("onboarding.done")
                : t("onboarding.explore")
              : t("onboarding.next")
          }
          onPress={goNext}
          accessibilityLabel={
            isLast
              ? mode === "replay"
                ? t("onboarding.done")
                : t("onboarding.explore")
              : t("onboarding.next")
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
  },
  topSpacer: { width: 36 },
  skipButton: { paddingVertical: spacing[2], paddingHorizontal: spacing[2] },
  skipText: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, color: colors.textSecondary },

  page: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing[6],
    gap: spacing[4],
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fontFamily.headlineExtrabold,
    letterSpacing: -0.8,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    maxWidth: 340,
  },

  footer: { padding: spacing[5], gap: spacing[4] },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing[2],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  dotActive: { backgroundColor: colors.accent },
});
