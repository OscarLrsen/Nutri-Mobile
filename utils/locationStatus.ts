import type { TFunction } from "i18next";

/**
 * Ported from Nutri-Frontend's src/lib/locationStatus.ts — pure TS, no DOM
 * dependency. Status derivation is identical to the web; labels go through
 * i18n (stable LocationStatusKind keys → locationStatus.* translations).
 */
export type LocationStatusKind =
  | "loading"
  | "noLocation"
  | "closed"
  | "paused"
  | "tempClosed"
  | "notYetOpen"
  | "closedForDay"
  | "open";

interface LocationLike {
  isVisible: boolean;
  isTemporarilyClosed: boolean;
  openTime?: string;
  closeTime?: string;
}

interface DeriveArgs {
  isLoading: boolean;
  isClosed: boolean;
  isPaused: boolean;
  location: LocationLike | null;
  // Defaults to new Date() — caller may override for tests/admin previews.
  now?: Date;
}

// "HH:mm" → minutes-since-midnight, or null if malformed.
function parseHHMMToMinutes(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// Single source of truth for customer-facing location status.
// Priority: loading > noLocation > closed > paused > tempClosed > notYetOpen > closedForDay > open
export function deriveLocationStatusKind({
  isLoading,
  isClosed,
  isPaused,
  location,
  now,
}: DeriveArgs): LocationStatusKind {
  if (isLoading) return "loading";
  if (!location || !location.isVisible) return "noLocation";
  if (isClosed) return "closed";
  if (isPaused) return "paused";
  if (location.isTemporarilyClosed) return "tempClosed";

  const openMin = parseHHMMToMinutes(location.openTime);
  const closeMin = parseHHMMToMinutes(location.closeTime);
  // Missing/malformed hours: don't lie. Default to "open" so the location is
  // shown rather than swallowed by a fallback — admin can fix the schedule.
  if (openMin == null || closeMin == null) return "open";

  const d = now ?? new Date();
  const nowMin = d.getHours() * 60 + d.getMinutes();

  if (nowMin < openMin) return "notYetOpen";
  if (nowMin > closeMin) return "closedForDay";
  return "open";
}

/** Status-dot/label colors per kind — ported 1:1 from the web's
 * HeroMobile.tsx STATUS_COLOR (previously a HomeScreen-local map; lives
 * here since the menu's status row became the consumer). */
export const STATUS_COLORS: Record<LocationStatusKind, string> = {
  loading: "#888888",
  noLocation: "#888888",
  closed: "#E8650A",
  paused: "#F4B860",
  tempClosed: "#E8650A",
  notYetOpen: "#F4B860",
  closedForDay: "#E8650A",
  open: "#6FD68A",
};

export function getLocationStatusLabel(
  kind: LocationStatusKind,
  openTime: string | null | undefined,
  t: TFunction,
): string {
  if (kind === "notYetOpen") {
    return openTime
      ? t("locationStatus.notYetOpen", { time: openTime })
      : t("locationStatus.notYetOpenSoon");
  }
  return t(`locationStatus.${kind}`);
}
