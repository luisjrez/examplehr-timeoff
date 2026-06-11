import type { QueryClient } from "@tanstack/react-query";

import { isPreConfirmation } from "@/domain/requestMachine";
import {
  cellKeyOf,
  type BalanceCell,
  type HcmRequestRecord,
} from "@/domain/types";

import type { Notify } from "./notifications";
import { parseBalanceCell, parseRequestRecord } from "./parsers";
import { queryKeys } from "./queryKeys";
import type { LedgerStore } from "./requestLedger";
import { syncDecisions } from "./syncDecisions";

/**
 * Folds one real-time HCM event (SSE) into client state (TRD §6.6).
 *
 * Cell events:
 * - Same no-version-regression rule as the corpus: SSE, verification reads
 *   and polls race freely; versions decide, arrival order does not.
 * - Narrate EXTERNAL changes (bonus, manager decisions elsewhere) — but stay
 *   silent when the change is explained by this session's own in-flight
 *   request: the SSE echo of our own write can beat the verification read,
 *   and toasting the user's own action would be noise.
 *
 * Request events (the multi-user sync path):
 * - A new/decided request invalidates the request queries, so an open
 *   manager tab sees filings appear without waiting for its poll.
 * - Decisions fold straight into the employee's ledger via syncDecisions —
 *   the FSM ignores events for requests it does not own.
 *
 * Malformed payloads are dropped: a broken event must never break the UI.
 */
export function reconcileRealtimeEvent(
  queryClient: QueryClient,
  ledger: LedgerStore,
  rawEvent: string,
  notify: Notify,
): void {
  const event = parseEvent(rawEvent);
  if (!event) {
    return;
  }
  if (event.type === "cell") {
    reconcileCell(queryClient, ledger, event.cell, notify);
  } else {
    reconcileRequest(queryClient, ledger, event.request, notify);
  }
}

function reconcileCell(
  queryClient: QueryClient,
  ledger: LedgerStore,
  cell: BalanceCell,
  notify: Notify,
): void {
  const key = queryKeys.cell(cell.employeeId, cell.locationId);
  const previous = queryClient.getQueryData<BalanceCell>(key);
  if (previous && previous.version > cell.version) {
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

function reconcileRequest(
  queryClient: QueryClient,
  ledger: LedgerStore,
  record: HcmRequestRecord,
  notify: Notify,
): void {
  // Manager tabs: refresh the queues immediately instead of waiting a poll.
  void queryClient.invalidateQueries({ queryKey: queryKeys.requestsRoot });
  // Employee tabs: fold a decision into the session ledger right now.
  // syncDecisions is a no-op for requests this session does not own.
  syncDecisions(ledger, [record], notify);
}

type RealtimeEvent =
  | { readonly type: "cell"; readonly cell: BalanceCell }
  | { readonly type: "request"; readonly request: HcmRequestRecord };

function parseEvent(rawEvent: string): RealtimeEvent | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawEvent);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    return undefined;
  }
  const type = (parsed as { type: unknown }).type;
  if (type === "cell" && "cell" in parsed) {
    const cell = parseBalanceCell((parsed as { cell: unknown }).cell);
    return cell ? { type: "cell", cell } : undefined;
  }
  if (type === "request" && "request" in parsed) {
    const record = parseRequestRecord((parsed as { request: unknown }).request);
    return record ? { type: "request", request: record } : undefined;
  }
  return undefined;
}
