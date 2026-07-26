import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { TFunction } from "i18next";
import {
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Clock,
  Package,
  RefreshCw,
  ShoppingBag,
  XCircle,
} from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { LoadingIndicator } from "@/components/feedback/LoadingIndicator";
import { useCart, SIZE_MULTIPLIERS, type MealSize } from "@/context/CartContext";
import type { Meal } from "@/types/cart";
import { getOrdersByEmail, type ApiOrder } from "@/services/api/orders";
import { getMealById } from "@/services/api/meals";
import { apiMealToMeal } from "@/utils/pricing";
import { formatDate, useLanguage, useTranslation, type AppLanguage } from "@/i18n";
import { formatPriceKr } from "@/utils/money";
import { colors, fontFamily, radius, spacing } from "@/theme";
import { formatCategorySnapshot } from "./profileOptions";

/**
 * Order history — port of the web's components/OrderHistory.tsx: lazy
 * "Visa"-loaded list of GET /orders/by-email orders, expandable cards with
 * status badge, line summary and the "Beställ igen" reorder flow. Reorder
 * re-adds every line through the SHARED cart: current meal fetched via
 * getMealById; if the meal no longer exists (404) or the line is legacy
 * (mealId null), a snapshot Meal is synthesized with basePrice derived from
 * the order line so pricing still reconciles (verbatim web logic).
 */

const STATUS_ICONS: Record<string, { Icon: typeof Clock; color: string; bg: string }> = {
  Pending: { Icon: Clock, color: "#facc15", bg: "rgba(250,204,21,0.1)" },
  Confirmed: { Icon: CheckCircle2, color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  Preparing: { Icon: ChefHat, color: "#fb923c", bg: "rgba(251,146,60,0.1)" },
  Ready: { Icon: CheckCircle2, color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
  HandedOut: { Icon: ShoppingBag, color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.06)" },
  Delivered: { Icon: ShoppingBag, color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.06)" },
  Cancelled: { Icon: XCircle, color: "#f87171", bg: "rgba(248,113,113,0.1)" },
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cfg = STATUS_ICONS[status] ?? {
    Icon: Package,
    color: "rgba(255,255,255,0.5)",
    bg: "rgba(255,255,255,0.06)",
  };
  const label = t(`orderHistory.statusNames.${status}`, { defaultValue: status });
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <cfg.Icon size={11} color={cfg.color} />
      <ThemedText style={[styles.statusBadgeText, { color: cfg.color }]}>{label}</ThemedText>
    </View>
  );
}

function formatOrderLabelDate(iso: string, language: AppLanguage) {
  return formatDate(new Date(iso), language, { month: "long", day: "numeric" });
}

function sizeLabel(size: string, t: TFunction): string {
  return t(`orderStatus.sizeNames.${size.toLowerCase()}`, { defaultValue: size });
}

function OrderCard({ order }: { order: ApiOrder }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState("");
  const { addItem } = useCart();
  const router = useRouter();

  const handleReorder = async () => {
    setReordering(true);
    setReorderError("");
    try {
      for (const item of order.lines) {
        const size = item.size as MealSize;
        const multiplier = SIZE_MULTIPLIERS[size] ?? 1;
        const lineTotalKr = item.lineTotalOre / 100;

        let mealObj: Meal;

        if (item.mealId) {
          try {
            mealObj = apiMealToMeal(await getMealById(item.mealId));
          } catch {
            // Meal removed from menu — derive price from order snapshot
            const basePrice = Math.round((lineTotalKr / item.quantity / multiplier) * 100) / 100;
            mealObj = {
              id: item.mealId,
              name: item.titleSnapshot,
              description: "",
              image: "",
              basePrice,
              category: formatCategorySnapshot(item.categorySnapshot, t),
              available: false,
              macros: {
                calories: item.calories,
                proteinG: item.proteinG,
                carbsG: item.carbsG,
                fatG: item.fatG,
                fiberG: item.fiberG ?? 0,
              },
              ingredients: [],
              sizes: [],
            };
          }
        } else {
          const basePrice = Math.round((lineTotalKr / item.quantity / multiplier) * 100) / 100;
          mealObj = {
            id: `legacy-${item.titleSnapshot}`,
            name: item.titleSnapshot,
            description: "",
            image: "",
            basePrice,
            category: formatCategorySnapshot(item.categorySnapshot, t),
            available: false,
            macros: {
              calories: item.calories,
              proteinG: item.proteinG,
              carbsG: item.carbsG,
              fatG: item.fatG,
              fiberG: item.fiberG ?? 0,
            },
            ingredients: [],
            sizes: [],
          };
        }

        addItem(mealObj, size, item.quantity);
      }
      router.push("/(tabs)/varukorg");
    } catch {
      setReorderError(t("orderHistory.reorderError"));
    } finally {
      setReordering(false);
    }
  };

  return (
    <View style={styles.orderCard}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.orderHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={styles.orderHeaderLeft}>
          <Package size={18} color={colors.accent} />
          <ThemedText style={styles.orderTitle} numberOfLines={1}>
            Order #{order.orderNumber}
            <ThemedText style={styles.orderDate}>
              {" "}
              • {formatOrderLabelDate(order.createdAt, language)}
            </ThemedText>
          </ThemedText>
        </View>
        <View style={styles.orderHeaderRight}>
          <StatusBadge status={order.status} />
          <ThemedText style={styles.orderTotal}>{formatPriceKr(order.totalOre, language)}</ThemedText>
          {expanded ? (
            <ChevronUp size={16} color="rgba(255,255,255,0.4)" />
          ) : (
            <ChevronDown size={16} color="rgba(255,255,255,0.4)" />
          )}
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.orderBody}>
          <View style={{ gap: spacing[3] }}>
            {order.lines.map((item, i) => (
              <View key={i} style={styles.lineRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText style={styles.lineTitle} numberOfLines={1}>
                    {item.titleSnapshot}
                  </ThemedText>
                  <ThemedText style={styles.lineMeta}>
                    {sizeLabel(item.size, t)} · {item.quantity} {t("orderHistory.qtyUnit")} ·{" "}
                    {item.calories} kcal
                  </ThemedText>
                </View>
                <ThemedText style={styles.linePrice}>
                  {formatPriceKr(item.lineTotalOre, language)}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Coupon/POS discount — the backend's authoritative order fields. */}
          {(order.discountAmountOre ?? 0) > 0 ? (
            <View style={styles.discountRow}>
              <ThemedText style={styles.discountLabel}>
                {order.discountPercent
                  ? t("coupon.orderDiscountRowPct", { pct: order.discountPercent })
                  : t("coupon.orderDiscountRowPlain")}
              </ThemedText>
              <ThemedText style={styles.discountValue}>
                −{formatPriceKr(order.discountAmountOre ?? 0, language)}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.orderFooter}>
            <ThemedText style={styles.footerTotal}>
              {t("orderHistory.total")}:{" "}
              <ThemedText style={[styles.footerTotal, { color: "#4ade80" }]}>
                {formatPriceKr(order.totalOre, language)}
              </ThemedText>
            </ThemedText>
            <Pressable
              onPress={handleReorder}
              disabled={reordering}
              style={({ pressed }) => [
                styles.reorderButton,
                pressed && !reordering && { backgroundColor: colors.accentHover },
                reordering && { opacity: 0.5 },
              ]}
              accessibilityRole="button"
            >
              <RefreshCw size={14} color={colors.textPrimary} />
              <ThemedText style={styles.reorderText}>{t("orderHistory.reorder")}</ThemedText>
            </Pressable>
          </View>
          {reorderError ? <ThemedText style={styles.errorText}>{reorderError}</ThemedText> : null}
        </View>
      )}
    </View>
  );
}

export function OrderHistory({ email }: { email: string }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    setError("");
    try {
      setOrders(await getOrdersByEmail(email));
      setLoaded(true);
    } catch {
      setError(t("orderHistory.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={load} style={styles.loadRow} accessibilityRole="button">
        <ThemedText style={styles.loadTitle}>{t("orderHistory.title").toUpperCase()}</ThemedText>
        {!loaded && !loading && (
          <ThemedText style={styles.showLink}>{t("orderHistory.show")}</ThemedText>
        )}
        {loading && <LoadingIndicator />}
      </Pressable>

      {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

      {loaded && orders !== null && (
        <View style={{ marginTop: spacing[4], gap: spacing[3] }}>
          {orders.length === 0 ? (
            <ThemedText style={styles.emptyText}>{t("orderHistory.emptyInline")}</ThemedText>
          ) : (
            orders.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing[5],
  },
  loadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  loadTitle: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  showLink: { fontSize: 12, color: colors.accent },
  emptyText: { paddingVertical: spacing[6], textAlign: "center", fontSize: 14, color: colors.textMuted },
  errorText: { marginTop: spacing[3], fontSize: 13, color: "#f87171" },
  orderCard: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  orderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  orderHeaderLeft: { flexDirection: "row", alignItems: "center", gap: spacing[3], flex: 1, minWidth: 0 },
  orderTitle: { flex: 1, fontSize: 13, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  orderDate: { fontSize: 12, fontFamily: fontFamily.bodyMedium, color: colors.textTertiary },
  orderHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: { fontSize: 11, fontFamily: fontFamily.bodySemibold },
  orderTotal: { fontSize: 13, fontFamily: fontFamily.bodyBold, color: "#4ade80" },
  orderBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  lineRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing[2] },
  lineTitle: { fontSize: 13.5, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  lineMeta: { marginTop: 2, fontSize: 11.5, color: colors.textTertiary },
  linePrice: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  discountRow: {
    marginTop: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  discountLabel: { fontSize: 11.5, color: colors.textTertiary },
  discountValue: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: "#4ade80" },
  orderFooter: {
    marginTop: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerTotal: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  reorderButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  reorderText: { fontSize: 13, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
});
