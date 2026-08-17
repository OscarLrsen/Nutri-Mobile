import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Check, Ticket, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import {
  isStampCardUnavailableError,
  useStampCardStatusQuery,
} from "@/services/api/stampCardQueries";
import { useCheckoutDiscount } from "@/context/CheckoutDiscountContext";
import type { CartItem } from "@/types/cart";
import { formatPriceKr } from "@/utils/money";
import { useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { homeAccents } from "@/features/home/homeAccents";

/**
 * "Gratis måltid tillgänglig" in the cart (patch 16C2).
 *
 * The amount shown here is a PREVIEW. The server recomputes the discount from
 * its own prices and its own cap when the order is created, and the order
 * response is what the customer is actually charged — this card never claims
 * otherwise.
 *
 * Only one reward may be used per order, so selecting the stamp card while a
 * coupon is active asks first. Nothing is ever silently deselected.
 */

/** A meal line the reward may be applied to. Drinks and extras are excluded
 * by the same rule the backend enforces, not by name matching. */
export function isQualifyingCartItem(item: CartItem): boolean {
  return item.kind !== "drink" && item.quantity > 0;
}

export function StampCardCheckoutCard({ items }: { items: CartItem[] }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { discount, selectStampCard, clearStampCard } = useCheckoutDiscount();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);

  const statusQuery = useStampCardStatusQuery();

  const qualifying = useMemo(() => items.filter(isQualifyingCartItem), [items]);

  // Straight from the status endpoint, which is the authoritative answer to
  // "what can be spent". The history endpoint also lists rewards, but it is a
  // log — redeemed, revoked and reserved ones are in it too, and filtering
  // that client-side would mean re-deriving redeemability from data kept for
  // a different purpose. Oldest ordinal first, as the server returns it.
  //
  // On a backend without the list (pre-16C2), this stays null and no
  // redemption is offered — better than pointing at a reward we cannot name.
  const nextReward = statusQuery.data?.availableRewardList?.[0] ?? null;
  const availableRewardId = nextReward?.id ?? null;
  // Each reward carries the cap that applied when it was earned, so previews
  // use ITS value rather than today's setting.
  const rewardMaxValueOre = nextReward?.maxValueOre ?? null;

  // The API predates this feature, or the customer has nothing to spend.
  if (statusQuery.isError && isStampCardUnavailableError(statusQuery.error)) return null;
  const status = statusQuery.data;
  if (!status || status.availableRewards <= 0) return null;
  // No reward list means an older backend: show nothing rather than a
  // redemption flow that cannot complete.
  if (!rewardMaxValueOre) return null;

  const selected = discount.type === "stamp-card" ? discount : null;
  const selectedItem = selected
    ? items.find((i) => i.clientLineId === selected.clientLineId)
    : null;

  // A drinks-only cart cannot use the reward — say so instead of showing a
  // toggle that would only fail.
  if (qualifying.length === 0) {
    return (
      <View style={styles.card}>
        <Head title={t("stampCardCheckout.availableTitle")} />
        <ThemedText style={styles.body}>{t("stampCardCheckout.noMealBody")}</ThemedText>
      </View>
    );
  }

  function apply(item: CartItem) {
    if (!availableRewardId || !item.clientLineId) return;
    selectStampCard({
      rewardId: availableRewardId,
      clientLineId: item.clientLineId,
      mealName: item.meal.name,
    });
    setPickerOpen(false);
  }

  function requestSelect() {
    // Exactly one candidate → no picker; the choice is already made.
    if (discount.type === "coupon") {
      setConflictOpen(true);
      return;
    }
    if (qualifying.length === 1) {
      apply(qualifying[0]);
      return;
    }
    setPickerOpen(true);
  }

  // The applied preview must use the SELECTED reward's own cap — the same
  // source CartScreen's summary row reads — so the card and the summary can
  // never quote different amounts if the selection is no longer the list's
  // first reward. Falls back to the offered reward's cap only when the
  // selected one has left the list (order creation is the authority then).
  const selectedRewardCapOre = selected
    ? status.availableRewardList?.find((r) => r.id === selected.rewardId)?.maxValueOre ??
      rewardMaxValueOre
    : rewardMaxValueOre;
  const previewOre = selectedItem
    ? Math.min(Math.round(selectedItem.meal.basePrice * 100), selectedRewardCapOre)
    : 0;
  const coversWholeMeal =
    !!selectedItem && Math.round(selectedItem.meal.basePrice * 100) <= selectedRewardCapOre;

  return (
    <View style={styles.card}>
      <Head
        title={
          selected
            ? t("stampCardCheckout.appliedTitle")
            : t("stampCardCheckout.availableTitle")
        }
      />

      {selected && selectedItem ? (
        <>
          <ThemedText style={styles.body}>
            {coversWholeMeal
              ? t("stampCardCheckout.appliedFree", { mealName: selected.mealName })
              : t("stampCardCheckout.appliedPartial", {
                  amount: formatPriceKr(previewOre, language),
                })}
          </ThemedText>
          {selectedItem.quantity > 1 ? (
            <ThemedText style={styles.portionNote}>
              {t("stampCardCheckout.onePortionOf", { total: selectedItem.quantity })}
            </ThemedText>
          ) : null}
          <ThemedText style={styles.previewNote}>{t("stampCardCheckout.previewNote")}</ThemedText>

          <View style={styles.actions}>
            {qualifying.length > 1 ? (
              <Action label={t("stampCardCheckout.changeMeal")} onPress={() => setPickerOpen(true)} />
            ) : null}
            <Action label={t("stampCardCheckout.remove")} onPress={clearStampCard} subtle />
          </View>
        </>
      ) : (
        <>
          <ThemedText style={styles.body}>{t("stampCardCheckout.availableBody")}</ThemedText>
          <Pressable
            onPress={requestSelect}
            disabled={!availableRewardId}
            style={({ pressed }) => [
              styles.cta,
              pressed && { opacity: 0.85 },
              !availableRewardId && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("stampCardCheckout.use")}
          >
            <ThemedText style={styles.ctaLabel}>{t("stampCardCheckout.use")}</ThemedText>
          </Pressable>
        </>
      )}

      <MealPicker
        visible={pickerOpen}
        items={qualifying}
        maxValueOre={rewardMaxValueOre}
        selectedClientLineId={selected?.clientLineId ?? null}
        onPick={apply}
        onClose={() => setPickerOpen(false)}
      />

      {/* Switching away from a coupon is never silent. */}
      <ConfirmSwitch
        visible={conflictOpen}
        currentName={discount.type === "coupon" ? `${discount.coupon.percentage}%` : ""}
        onKeep={() => setConflictOpen(false)}
        onSwitch={() => {
          setConflictOpen(false);
          if (qualifying.length === 1) apply(qualifying[0]);
          else setPickerOpen(true);
        }}
      />
    </View>
  );
}

function Head({ title }: { title: string }) {
  return (
    <View style={styles.head}>
      <View style={styles.iconWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ticket size={15} color={homeAccents.protein.value} strokeWidth={2} />
      </View>
      <ThemedText style={styles.title}>{title}</ThemedText>
    </View>
  );
}

function Action({ label, onPress, subtle }: { label: string; onPress: () => void; subtle?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <ThemedText style={[styles.actionLabel, subtle && styles.actionLabelSubtle]}>{label}</ThemedText>
    </Pressable>
  );
}

/**
 * Meal picker. A line with quantity 3 is ONE choice showing "1 of 3 portions"
 * rather than three identical rows — the reward covers one portion and the
 * backend knows which line, so three indistinguishable options would only ask
 * the customer to make a distinction that does not exist.
 */
function MealPicker({
  visible,
  items,
  maxValueOre,
  selectedClientLineId,
  onPick,
  onClose,
}: {
  visible: boolean;
  items: CartItem[];
  maxValueOre: number;
  selectedClientLineId: string | null;
  onPick: (item: CartItem) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHead}>
            <ThemedText accessibilityRole="header" style={styles.modalTitle}>
              {t("stampCardCheckout.pickTitle")}
            </ThemedText>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalList}>
            {items.map((item) => {
              const unitOre = Math.round(item.meal.basePrice * 100);
              const discountOre = Math.min(unitOre, maxValueOre);
              const isSelected = item.clientLineId === selectedClientLineId;
              return (
                <Pressable
                  key={item.clientLineId ?? item.id}
                  onPress={() => onPick(item)}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && styles.optionSelected,
                    pressed && { opacity: 0.8 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={
                    item.quantity > 1
                      ? `${item.meal.name}, ${t("stampCardCheckout.onePortionOf", { total: item.quantity })}`
                      : item.meal.name
                  }
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText style={styles.optionName}>{item.meal.name}</ThemedText>
                    <ThemedText style={styles.optionMeta}>
                      {item.quantity > 1
                        ? `${t("stampCardCheckout.onePortionOf", { total: item.quantity })} · −${formatPriceKr(discountOre, language)}`
                        : `−${formatPriceKr(discountOre, language)}`}
                    </ThemedText>
                  </View>
                  {isSelected ? <Check size={18} color={homeAccents.protein.value} strokeWidth={2.5} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ConfirmSwitch({
  visible,
  currentName,
  onKeep,
  onSwitch,
}: {
  visible: boolean;
  currentName: string;
  onKeep: () => void;
  onSwitch: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeep}>
      <View style={styles.modalBackdrop}>
        <View style={styles.confirmBox}>
          <ThemedText accessibilityRole="header" style={styles.confirmTitle}>
            {t("stampCardCheckout.conflictTitle")}
          </ThemedText>
          <ThemedText style={styles.body}>
            {t("stampCardCheckout.conflictBody", { current: currentName })}
          </ThemedText>
          <View style={styles.confirmActions}>
            <Pressable
              onPress={onKeep}
              style={({ pressed }) => [styles.confirmSecondary, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.confirmSecondaryLabel}>
                {t("stampCardCheckout.conflictKeep")}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onSwitch}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.ctaLabel}>{t("stampCardCheckout.conflictSwitch")}</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: homeAccents.protein.soft,
    borderWidth: 1,
    borderColor: homeAccents.protein.border,
    borderRadius: radius.card,
    padding: spacing[4],
    gap: spacing[2],
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  title: { flex: 1, fontSize: 14, fontFamily: fontFamily.headlineSemibold, color: colors.textPrimary },
  body: { fontSize: 12.5, lineHeight: 17.5, color: colors.textSecondary },
  portionNote: { fontSize: 12.5, lineHeight: 17.5, color: colors.textPrimary },
  previewNote: { fontSize: 11.5, lineHeight: 16, color: colors.textTertiary },
  cta: {
    backgroundColor: homeAccents.protein.value,
    borderRadius: radius.btn,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
  },
  ctaLabel: { fontSize: 13.5, fontFamily: fontFamily.headlineSemibold, color: colors.bg },
  actions: { flexDirection: "row", gap: spacing[4], marginTop: 2 },
  action: { minHeight: 44, justifyContent: "center" },
  actionLabel: { fontSize: 13, fontFamily: fontFamily.headlineSemibold, color: homeAccents.protein.value },
  actionLabelSubtle: { color: colors.textSecondary },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing[4],
    maxHeight: "70%",
    gap: spacing[3],
  },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 16, fontFamily: fontFamily.headlineSemibold, color: colors.textPrimary },
  modalList: { gap: spacing[2], paddingBottom: spacing[4] },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    minHeight: 56,
    paddingHorizontal: spacing[3],
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  optionSelected: { borderColor: homeAccents.protein.value },
  optionName: { fontSize: 14, fontFamily: fontFamily.headlineSemibold, color: colors.textPrimary },
  optionMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  confirmBox: {
    margin: spacing[4],
    marginBottom: spacing[8],
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing[4],
    gap: spacing[2],
  },
  confirmTitle: { fontSize: 16, fontFamily: fontFamily.headlineSemibold, color: colors.textPrimary },
  confirmActions: { flexDirection: "row", gap: spacing[2], marginTop: spacing[2] },
  confirmSecondary: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmSecondaryLabel: { fontSize: 13.5, fontFamily: fontFamily.headlineSemibold, color: colors.textPrimary },
});
