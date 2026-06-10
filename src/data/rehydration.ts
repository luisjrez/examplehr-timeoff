import { isPreConfirmation } from "@/domain/requestMachine";

import { mergeCell } from "./applyCorpus";
import { hcmApi } from "./hcmApi";
import type { SubmitDeps } from "./submitFlow";

/**
 * Boot-time reconciliation for a rehydrated ledger (plan-0001 phase-2).
 *
 * The pending overlay persists across reloads, but a rehydrated
 * pre-confirmation request is a claim we can no longer trust: HCM may have
 * applied the hold before the reload, in which case re-subtracting it would
 * DOUBLE-COUNT against the confirmed balance. So every pre-confirmation
 * request re-runs verification against authoritative reads:
 *
 * - record exists, still pending  → pending_approval (hold already in
 *   HCM's number; the overlay stops subtracting it)
 * - record exists, decided        → approved / denied
 * - record missing                → contradicted (verify_mismatch), recoverable
 * - no HCM id (crash mid-write)   → contradicted (hcm_silent), recoverable
 *
 * Settled and pending_approval requests pass through untouched — the
 * decision sync poll/SSE already own those transitions.
 */
export async function reconcileRehydratedLedger(
  deps: SubmitDeps,
): Promise<void> {
  const { queryClient, ledger } = deps;
  const dispatch = ledger.getState().dispatch;

  for (const [clientId, request] of Object.entries(
    ledger.getState().requests,
  )) {
    if (!isPreConfirmation(request.phase)) {
      continue;
    }

    if (!request.hcmId) {
      // We never learned HCM's answer; the safe direction is a recoverable
      // contradiction (retry/discard), never a silent re-hold.
      driveToVerifying(dispatch, clientId, request.phase.status);
      dispatch(clientId, { type: "HCM_SILENT" });
      continue;
    }

    driveToVerifying(dispatch, clientId, request.phase.status);

    const [record, cell] = await Promise.all([
      hcmApi.getRequest(request.hcmId),
      hcmApi.getCell(request.employeeId, request.locationId),
    ]);
    if (cell.ok) {
      mergeCell(queryClient, cell.value);
    }

    if (!record.ok) {
      dispatch(clientId, { type: "VERIFY_MISMATCH" });
      deps.notify({
        kind: "request_contradicted",
        message:
          "A request from your previous session was not found at HCM. You can retry or discard it.",
      });
      continue;
    }

    dispatch(clientId, { type: "VERIFY_MATCH" });
    if (record.value.status === "approved") {
      dispatch(clientId, { type: "MANAGER_APPROVED" });
    } else if (record.value.status === "denied") {
      dispatch(clientId, { type: "MANAGER_DENIED" });
    }
  }
}

/** Walk the FSM from any pre-confirmation phase into `verifying`. */
function driveToVerifying(
  dispatch: ReturnType<SubmitDeps["ledger"]["getState"]>["dispatch"],
  clientId: string,
  status: string,
): void {
  if (status === "submitting") {
    dispatch(clientId, { type: "HCM_ACCEPTED" });
  }
  dispatch(clientId, { type: "VERIFY_START" });
}
