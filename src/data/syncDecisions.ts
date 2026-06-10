import type { HcmRequestRecord } from "@/domain/types";

import type { Notify } from "./notifications";
import type { LedgerRequest, LedgerStore } from "./requestLedger";

/**
 * Reconciles manager decisions back into the employee's session ledger
 * (TRD §5: the FSM's MANAGER_* events). The employee was only ever told
 * "awaiting approval", so both outcomes are honest news — never a reversal.
 *
 * Returns the requests that just transitioned so the caller can re-read
 * their cells: a denial refunds the hold at HCM, and waiting for the next
 * corpus poll would leave a wrong balance on screen for up to a minute.
 */
export function syncDecisions(
  ledger: LedgerStore,
  records: readonly HcmRequestRecord[],
  notify: Notify,
): readonly LedgerRequest[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const transitioned: LedgerRequest[] = [];

  for (const [clientId, request] of Object.entries(
    ledger.getState().requests,
  )) {
    if (request.phase.status !== "pending_approval" || !request.hcmId) {
      continue;
    }
    const decided = recordsById.get(request.hcmId);
    if (decided?.status === "approved") {
      ledger.getState().dispatch(clientId, { type: "MANAGER_APPROVED" });
      transitioned.push(request);
      notify({
        kind: "request_confirmed",
        message: `Time off approved: ${request.days} day(s) at ${request.locationId}. Enjoy! 🎉`,
      });
    } else if (decided?.status === "denied") {
      ledger.getState().dispatch(clientId, { type: "MANAGER_DENIED" });
      transitioned.push(request);
      notify({
        kind: "request_denied",
        message: `Your request for ${request.days} day(s) was denied by your manager.`,
      });
    }
  }

  return transitioned;
}
