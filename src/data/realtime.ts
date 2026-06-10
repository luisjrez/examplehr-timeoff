import type { QueryClient } from "@tanstack/react-query";

import { isPreConfirmation } from "@/domain/requestMachine";
import { cellKeyOf, type BalanceCell } from "@/domain/types";

import type { Notify } from "./notifications";
import { parseBalanceCell } from "./parsers";
import { queryKeys } from "./queryKeys";
import type { LedgerStore } from "./requestLedger";

/**
 * Folds one real-time HCM event (SSE) into the confirmed layer (TRD §6.6).
 *
 * Rules:
 * - Same no-version-regression rule as the corpus: SSE, verification reads
 *   and polls race freely; versions decide, arrival order does not.
 * - Narrate EXTERNAL changes (bonus, manager decisions elsewhere) — but stay
 *   silent when the change is explained by this session's own in-flight
 *   request: the SSE echo of our own write can beat the verification read,
 *   and toasting the user's own action would be noise.
 * - Malformed payloads are dropped: a broken event must never break the UI.
 */
export function reconcileRealtimeEvent(
  queryClient: QueryClient,
  ledger: LedgerStore,
  rawEvent: string,
  notify: Notify,
): void {
  const cell = parseEvent(rawEvent);
  if (!cell) {
    return;
  }

  const key = queryKeys.cell(cell.employeeId, cell.locationId);
  const previous = queryClient.getQueryData<BalanceCell>(key);
  if (previous && previous.version >= cell.version) {
    return;
  }

  const cellKey = cellKeyOf(cell.employeeId, cell.locationId);
  const explainedByOwnAction = Object.values(ledger.getState().requests).some(
    (request) =>
      isPreConfirmation(request.phase) &&
      cellKeyOf(request.employeeId, request.locationId) === cellKey,
  );

  if (previous && !explainedByOwnAction && cell.days !== previous.days) {
    const delta = cell.days - previous.days;
    notify({
      kind: "balance_changed",
      message: `Balance updated by HCM: ${delta > 0 ? `+${delta}` : `${delta}`} day(s) at ${cell.locationId}`,
      cellKey,
      deltaDays: delta,
    });
  }

  queryClient.setQueryData(key, cell);
}

function parseEvent(rawEvent: string): BalanceCell | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawEvent);
  } catch {
    return undefined;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("type" in parsed) ||
    (parsed as { type: unknown }).type !== "cell" ||
    !("cell" in parsed)
  ) {
    return undefined;
  }
  return parseBalanceCell((parsed as { cell: unknown }).cell);
}
