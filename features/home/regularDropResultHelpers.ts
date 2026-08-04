import type { ApiRegularDropPoll, ApiRegularDropOption } from "@/services/api/regularDrops";

import { sortDropOptions } from "./regularDropHelpers";

/**
 * Defensive join between poll.options and result.options for the ended
 * view. STRICTLY presentation plumbing — the backend already computed
 * votes, integer percent (largest remainder, sums to 100), winners and tie:
 * nothing here divides, rounds, ranks by votes or picks winners. The only
 * numeric operation allowed is the visual width clamp, kept separate from
 * the displayed server percent.
 *
 * Missing-row policy: the backend contract emits a result row for EVERY
 * option (options without votes get votes:0/percent:0 — verified by the
 * phase-2 calculator and its tests), so a poll option without a matching
 * result row is a contract anomaly: its numbers are HIDDEN (never invented)
 * and the anomaly is reported for dev logging.
 */

export interface DropResultRow {
  option: ApiRegularDropOption;
  /** Server values; null when the result row is missing (anomaly). */
  votes: number | null;
  percent: number | null;
  isWinner: boolean;
  isUsersChoice: boolean;
}

export interface DropResultView {
  totalVotes: number;
  isTie: boolean;
  rows: DropResultRow[];
  /** Contract anomalies for __DEV__ logging — presentation already degraded
   * safely when any of these exist. */
  anomalies: string[];
}

export function buildDropResultView(poll: ApiRegularDropPoll): DropResultView | null {
  const result = poll.result;
  if (!result) return null;

  const anomalies: string[] = [];
  const byOptionId = new Map(result.options.map((r) => [r.optionId, r]));

  // Winner presentation is suppressed entirely at zero votes, even if the
  // server sent ids (defensive — never shown as "0 % winner").
  const showWinners = result.totalVotes > 0;
  if (!showWinners && result.winnerOptionIds.length > 0) {
    anomalies.push("winnerOptionIds present with totalVotes == 0 — winner presentation suppressed");
  }
  if (!result.isTie && result.winnerOptionIds.length > 1) {
    anomalies.push("isTie false but multiple winnerOptionIds — showing all server-marked winners");
  }
  if (result.isTie && result.winnerOptionIds.length === 0) {
    anomalies.push("isTie true but winnerOptionIds empty — no option marked");
  }

  const rows = sortDropOptions(poll.options).map((option): DropResultRow => {
    const row = byOptionId.get(option.id);
    if (!row) anomalies.push(`option ${option.id} has no result row — numbers hidden`);
    return {
      option,
      votes: row ? row.votes : null,
      percent: row ? row.percent : null,
      isWinner: showWinners && result.winnerOptionIds.includes(option.id),
      isUsersChoice: poll.votedOptionId !== null && option.id === poll.votedOptionId,
    };
  });

  if (poll.votedOptionId && !rows.some((r) => r.isUsersChoice)) {
    anomalies.push("votedOptionId matches no option — no choice marker shown");
  }

  return { totalVotes: result.totalVotes, isTie: result.isTie, rows, anomalies };
}

/** VISUAL width only — the displayed text always shows the server value.
 * Layout survives an out-of-range server percent without breaking. */
export function clampPercentWidth(percent: number | null): number {
  if (percent === null || Number.isNaN(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}
