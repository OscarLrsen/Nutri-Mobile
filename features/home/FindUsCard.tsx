import { Linking, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { LocationInfoData, StoreStatusData } from "@/services/api/store";
import { landingCopy as copy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Hitta oss — port of the web's landing FindUs.tsx: label, 📍 location name,
 * description, opening hours, "Karta →" and the status pill. Same 4-state
 * status derivation as the web component (open/paused/closed/loading — NOT
 * the hero's more granular utils/locationStatus states) and the same badge
 * colors (#22C55E / #EAB308 / #6B7280).
 *
 * Data comes as props from HomeScreen's existing ["store","status"] /
 * ["store","location"] queries — no duplicate fetching. All fields are the
 * verified StoreStatusData / LocationInfoData DTOs.
 *
 * Deviations & fallbacks (documented):
 * - The web's blinking status dot is static here (animation not worth a
 *   reanimated loop for a 6px dot before design sign-off).
 * - mapUrl is validated exactly like the web's safeUrl (http/https only);
 *   the web falls back to its /hitta-oss page, which mobile doesn't have —
 *   an invalid/missing URL renders "Karta →" muted and non-pressable.
 * - openTime/closeTime are non-nullable "HH:mm" strings in the DTO; if the
 *   backend ever sends empty strings the hours row is hidden rather than
 *   rendering " – ".
 */

type ServiceStatus = "open" | "paused" | "closed" | "loading";

const STATUS_BADGE_BG: Record<Exclude<ServiceStatus, "loading">, string> = {
  open: "#22C55E",
  paused: "#EAB308",
  closed: "#6B7280",
};

const STATUS_DOT: Record<Exclude<ServiceStatus, "loading">, string> = {
  open: "#2DB96B",
  paused: "#EAB308",
  closed: "#888888",
};

/** Web-parity safeUrl: only http(s) URLs are openable. */
function isSafeMapUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function FindUsCard({
  location,
  storeStatus,
  isLoading,
}: {
  location: LocationInfoData | null;
  storeStatus: StoreStatusData | null;
  isLoading: boolean;
}) {
  // Web-parity fallback: no data (fetch failed/pending) or admin-hidden
  // location renders the label-only card.
  if (!location || !location.isVisible) {
    return (
      <View style={styles.card}>
        <ThemedText style={styles.label}>{copy.findusLabel}</ThemedText>
      </View>
    );
  }

  const status: ServiceStatus = isLoading
    ? "loading"
    : !storeStatus || storeStatus.status === "Closed"
      ? "closed"
      : storeStatus.status === "Paused"
        ? "paused"
        : "open";
  const isOpen = status === "open";
  const badgeBg = status === "loading" ? STATUS_BADGE_BG.closed : STATUS_BADGE_BG[status];
  const dotColor = status === "loading" ? STATUS_DOT.closed : STATUS_DOT[status];

  const showTempClosedWarning = isOpen && location.isTemporarilyClosed;
  const extraMessage = !isOpen && storeStatus?.publicMessage ? storeStatus.publicMessage : null;
  const hasHours = !!location.openTime && !!location.closeTime;
  const mapUrlValid = isSafeMapUrl(location.mapUrl);

  return (
    <View style={styles.card}>
      <ThemedText style={[styles.label, { marginBottom: spacing[3] }]}>
        {copy.findusLabel}
      </ThemedText>

      <View style={styles.bodyRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText style={styles.locationName}>📍 {location.locationName}</ThemedText>

          {location.description ? (
            <ThemedText style={styles.description}>{location.description}</ThemedText>
          ) : null}

          {hasHours ? (
            <ThemedText style={styles.hours}>
              {location.openTime} – {location.closeTime}
            </ThemedText>
          ) : null}

          {mapUrlValid ? (
            <Pressable
              onPress={() => Linking.openURL(location.mapUrl).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel={copy.findusMap}
              style={{ alignSelf: "flex-start" }}
            >
              <ThemedText style={styles.mapLink}>{copy.findusMap}</ThemedText>
            </Pressable>
          ) : (
            <ThemedText style={[styles.mapLink, styles.mapLinkDisabled]}>
              {copy.findusMap}
            </ThemedText>
          )}

          {showTempClosedWarning ? (
            <View style={styles.tempClosedPill}>
              <ThemedText style={styles.tempClosedText}>{copy.findusTempClosed}</ThemedText>
            </View>
          ) : null}

          {extraMessage ? (
            <ThemedText style={styles.extraMessage}>{extraMessage}</ThemedText>
          ) : null}
        </View>

        {/* Status pill (web: colored badge, white uppercase label) */}
        <View style={[styles.statusPill, { backgroundColor: badgeBg, borderColor: badgeBg }]}>
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          <ThemedText style={styles.statusPillText}>
            {copy.statusNames[status] ?? status}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: spacing[4],
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#262626",
  },
  label: {
    fontSize: 10,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#888888",
  },
  bodyRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  locationName: {
    fontSize: 15,
    fontFamily: fontFamily.bodyBold,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  description: { marginTop: 4, fontSize: 13, color: "#888888" },
  hours: { marginTop: spacing[2], marginBottom: spacing[3], fontSize: 13, color: "#888888" },
  mapLink: { fontSize: 13, fontFamily: fontFamily.bodyBold, color: colors.accent },
  mapLinkDisabled: { opacity: 0.4 },
  tempClosedPill: {
    alignSelf: "flex-start",
    marginTop: spacing[2],
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "rgba(232,101,10,0.15)",
  },
  tempClosedText: { fontSize: 11, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  extraMessage: { marginTop: spacing[2], fontSize: 11, fontStyle: "italic", color: "#AAAAAA" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: {
    fontSize: 10,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#FFFFFF",
  },
});
