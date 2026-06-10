import { isPreConfirmation } from "./requestMachine";
import type {
  BalanceCell,
  BalanceCellView,
  Staleness,
  TimeOffRequest,
} from "./types";

/**
 * Age thresholds for the staleness signal (TRD §6.5). Exported so tests and
 * stories pin the exact boundaries instead of duplicating magic numbers.
 */
export const STALENESS_THRESHOLDS_MS = {
  aging: 30_000,
  stale: 120_000,
} as const;

export function stalenessOf(updatedAt: string, now: Date): Staleness {
  const age = now.getTime() - new Date(updatedAt).getTime();
  if (age >= STALENESS_THRESHOLDS_MS.stale) {
    return "stale";
  }
  if (age >= STALENESS_THRESHOLDS_MS.aging) {
    return "aging";
  }
  return "fresh";
}

/**
 * The single place where confirmed truth and the optimistic overlay meet
 * (TRD §4). Pure function: the data layer feeds it the confirmed cell from
 * the query cache and the requests from the ledger; the UI renders the result.
 *
 * Invariant guarded by property tests:
 *   projected === (confirmed?.days ?? 0) − Σ days of pre-confirmation requests
 */
export function projectCell(
  confirmed: BalanceCell | undefined,
  requests: readonly TimeOffRequest[],
  now: Date,
): BalanceCellView {
  const pending = requests.filter((request) =>
    isPreConfirmation(request.phase),
  );
  const heldDays = pending.reduce((sum, request) => sum + request.days, 0);

  return {
    confirmed,
    pending,
    projected: (confirmed?.days ?? 0) - heldDays,
    // A cell we never managed to read is the worst case of stale.
    staleness: confirmed ? stalenessOf(confirmed.updatedAt, now) : "stale",
  };
}
