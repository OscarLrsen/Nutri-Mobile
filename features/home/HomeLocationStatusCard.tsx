import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { Skeleton } from "@/components/feedback/Skeleton";
import { getLocation, getStoreStatus } from "@/services/api/store";
import {
  deriveLocationStatusKind,
  getLocationStatusLabel,
  STATUS_COLORS,
} from "@/utils/locationStatus";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, radius, spacing } from "@/theme";

/**
 * "Where is Nutri today" on Home (patch 15) — location + opening hours,
 * directly under the greeting and above Today's plan.
 *
 * Reuses the EXACT queries Meny already owns (["store","status"] with its
 * 30s poll and ["store","location"]), so the two screens share cache rows
 * and can never disagree, and the derivation goes through the existing
 * utils/locationStatus helpers rather than a second copy of the rules.
 *
 * Deliberately NOT patch 14B: the dated schedule is not merged and there
 * is no service picker yet. This component is the seam — when 14B lands,
 * only what it reads changes, not where it sits or how Home composes it.
 */
export function HomeLocationStatusCard() {
  const { t } = useTranslation();

  const statusQuery = useQuery({
    queryKey: ["store", "status"],
    queryFn: getStoreStatus,
    refetchInterval: 30_000,
  });
  const locationQuery = useQuery({ queryKey: ["store", "location"], queryFn: getLocation });

  const loading = statusQuery.isLoading || locationQuery.isLoading;
  const failed = statusQuery.isError && locationQuery.isError;

  if (loading) {
    return (
      <View style={styles.card} accessibilityLabel={t("home.locationHead")}>
        <Skeleton height={14} width={120} />
        <Skeleton height={12} width={180} />
      </View>
    );
  }

  // Both sources down: say so honestly rather than presenting a cached
  // opening hour as if it were current.
  if (failed) {
    return (
      <View style={styles.card}>
        <ThemedText style={styles.name}>{t("home.locationUnavailable")}</ThemedText>
      </View>
    );
  }

  const storeStatus = statusQuery.data ?? null;
  const location = locationQuery.data ?? null;

  // Same derivation Meny uses: an unreachable/unknown status counts as
  // closed, never as open.
  const isClosed = storeStatus ? storeStatus.status === "Closed" : true;
  const isPaused = storeStatus?.status === "Paused";
  const kind = deriveLocationStatusKind({
    isLoading: false,
    isClosed,
    isPaused,
    location,
  });

  const locationName =
    (location?.isVisible && location.locationName) || storeStatus?.location || null;

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={t("home.locationAria", {
        location: locationName ?? t("home.locationUnknown"),
        status: getLocationStatusLabel(kind, location?.openTime, t),
      })}
    >
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <MapPin size={14} color={colors.accent} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText style={styles.name} numberOfLines={1}>
            {locationName ?? t("home.locationUnknown")}
          </ThemedText>
          <ThemedText style={[styles.status, { color: STATUS_COLORS[kind] }]} numberOfLines={2}>
            {getLocationStatusLabel(kind, location?.openTime, t)}
            {location && !isClosed && !isPaused && location.openTime && location.closeTime
              ? ` · ${location.openTime}–${location.closeTime}`
              : ""}
          </ThemedText>
        </View>
      </View>
      {storeStatus?.publicMessage ? (
        <ThemedText variant="caption" style={styles.publicMessage} numberOfLines={2}>
          {storeStatus.publicMessage}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[2],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.btn,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  name: {
    fontSize: 14.5,
    fontFamily: fontFamily.bodySemibold,
    color: colors.textPrimary,
  },
  status: { fontSize: 12, marginTop: 1 },
  publicMessage: { color: colors.textTertiary },
});
