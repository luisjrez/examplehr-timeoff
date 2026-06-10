import type { QueryClient } from "@tanstack/react-query";

import { cellKeyOf, type BalanceCell } from "@/domain/types";

import type { Notify } from "./notifications";
import { queryKeys } from "./queryKeys";

/**
 * Folds a corpus snapshot into the per-cell query cache (TRD §6.2):
 * - seeds unknown cells, so the grid never waterfalls N per-cell requests;
 * - announces balance changes (the mid-session anniversary bonus) so the
 *   user is reconciled, not surprised;
 * - NEVER regresses a cell: the corpus is slow, so a per-cell verification
 *   read may already have written a newer version than this snapshot.
 *
 * It only touches the confirmed layer. The pending overlay lives elsewhere
 * by design, so nothing here can clobber an in-flight user action.
 */
export function applyCorpus(
  queryClient: QueryClient,
  cells: readonly BalanceCell[],
  notify: Notify,
): void {
  for (const cell of cells) {
    const key = queryKeys.cell(cell.employeeId, cell.locationId);
    const previous = queryClient.getQueryData<BalanceCell>(key);

    if (previous && previous.version >= cell.version) {
      continue;
    }
    if (previous && cell.days !== previous.days) {
      notify({
        kind: "balance_changed",
        message: `Balance updated by HCM: ${formatDelta(cell.days - previous.days)} day(s) at ${cell.locationId}`,
        cellKey: cellKeyOf(cell.employeeId, cell.locationId),
        deltaDays: cell.days - previous.days,
      });
    }
    queryClient.setQueryData(key, cell);
  }
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

/** Merge one authoritative cell read; same no-regression rule, no toast. */
export function mergeCell(queryClient: QueryClient, cell: BalanceCell): void {
  const key = queryKeys.cell(cell.employeeId, cell.locationId);
  const previous = queryClient.getQueryData<BalanceCell>(key);
  if (!previous || cell.version > previous.version) {
    queryClient.setQueryData(key, cell);
  }
}
