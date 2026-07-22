import type { ApiRegularDropOption, ApiRegularDropResponse } from "@/services/api/regularDrops";

/**
 * Pure helpers for the Regular Drop Home section — no React/EF/i18n so the
 * countdown, sorting and refetch cadence are unit-testable. The client
 * clock only ever drives PRESENTATION and refetch timing; whether a vote is
 * allowed is decided by the backend alone.
 */

export interface DropCountdown {
  unit: "day" | "hour" | "minute" | "ended" | "invalid";
  count: number;
}

/** Countdown to endsAt at minute resolution. Under one minute reports
 * 1 minute (natural copy, no seconds); passed deadlines report "ended";
 * unparseable dates report "invalid" and must never throw. */
export function getDropCountdown(endsAtIso: string, nowMs: number): DropCountdown {
  const end = Date.parse(endsAtIso);
  if (Number.isNaN(end)) return { unit: "invalid", count: 0 };
  const diffMs = end - nowMs;
  if (diffMs <= 0) return { unit: "ended", count: 0 };
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return { unit: "minute", count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hour", count: hours };
  return { unit: "day", count: Math.floor(hours / 24) };
}

/** Stable display order: DisplayOrder, then id as a defensive tiebreak.
 * Returns a new array — never mutates the query-cache array. */
export function sortDropOptions(options: readonly ApiRegularDropOption[]): ApiRegularDropOption[] {
  return [...options].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id)
  );
}

/**
 * Adaptive refetch cadence for the active-poll query:
 * no active poll → off; >1 h left → 5 min; ≤1 h → 1 min; deadline locally
 * passed → 12 s until the server confirms the poll is gone; invalid dates
 * never cause aggressive polling.
 */
export function getDropRefetchIntervalMs(
  data: ApiRegularDropResponse | undefined,
  nowMs: number
): number | false {
  const poll = data?.poll;
  if (!poll || !poll.isActive) return false;
  const countdown = getDropCountdown(poll.endsAt, nowMs);
  if (countdown.unit === "invalid") return false;
  if (countdown.unit === "ended") return 12_000;
  const msLeft = Date.parse(poll.endsAt) - nowMs;
  return msLeft <= 3_600_000 ? 60_000 : 300_000;
}
