import type { QueryClient } from "@tanstack/react-query";

import type { BalanceCell, RejectionReason } from "@/domain/types";

import { mergeCell } from "./applyCorpus";
import { hcmApi, type ApiError, type ChaosInjection } from "./hcmApi";
import type { Notify } from "./notifications";
import { queryKeys } from "./queryKeys";
import type { LedgerStore } from "./requestLedger";

/**
 * Orchestration of the filing lifecycle (TRD §5): drives the pure FSM with
 * network outcomes. Framework-free on purpose — the integration tests
 * exercise it against MSW with a real QueryClient and a real ledger, no React.
 *
 * The crucial step is VERIFICATION: an HCM 2xx only moves the request to
 * `accepted_unverified`; we then read back BOTH the request record and the
 * authoritative cell, and only a coherent pair confirms the filing.
 */
export interface SubmitDeps {
  readonly queryClient: QueryClient;
  readonly ledger: LedgerStore;
  readonly notify: Notify;
}

export interface SubmitInput {
  readonly employeeId: string;
  readonly locationId: string;
  readonly days: number;
  readonly chaos?: ChaosInjection;
}

export async function submitTimeOffRequest(
  input: SubmitInput,
  deps: SubmitDeps,
): Promise<void> {
  const clientId = crypto.randomUUID();
  deps.ledger.getState().upsert({
    id: clientId,
    employeeId: input.employeeId,
    locationId: input.locationId,
    days: input.days,
    phase: { status: "draft" },
    createdAt: new Date().toISOString(),
  });
  deps.ledger.getState().dispatch(clientId, { type: "SUBMIT" });

  await fileAndVerify(clientId, input, deps);
}

/** Re-submit a contradicted request against the fresh balance (TRD §5). */
export async function retryRequest(
  clientId: string,
  deps: SubmitDeps,
): Promise<void> {
  const record = deps.ledger.getState().requests[clientId];
  if (!record || record.phase.status !== "contradicted") {
    return;
  }
  deps.ledger.getState().dispatch(clientId, { type: "RETRY" });
  await fileAndVerify(
    clientId,
    {
      employeeId: record.employeeId,
      locationId: record.locationId,
      days: record.days,
    },
    deps,
  );
}

/** Locally settle a contradicted request the user chose to abandon. */
export function discardRequest(clientId: string, deps: SubmitDeps): void {
  deps.ledger.getState().dispatch(clientId, { type: "DISCARD" });
}

async function fileAndVerify(
  clientId: string,
  input: SubmitInput,
  deps: SubmitDeps,
): Promise<void> {
  const { queryClient, ledger, notify } = deps;
  const dispatch = ledger.getState().dispatch;

  // CAS guard: write against the version we are showing the user. If the
  // cache is cold, take one authoritative read first.
  const cached = queryClient.getQueryData<BalanceCell>(
    queryKeys.cell(input.employeeId, input.locationId),
  );
  let expectedVersion = cached?.version;
  if (expectedVersion === undefined) {
    const fresh = await hcmApi.getCell(input.employeeId, input.locationId);
    if (!fresh.ok) {
      dispatch(clientId, { type: "HCM_SILENT" });
      notifyContradiction(notify, "HCM is unreachable; nothing was filed.");
      return;
    }
    mergeCell(queryClient, fresh.value);
    expectedVersion = fresh.value.version;
  }

  const filed = await hcmApi.fileRequest(
    {
      employeeId: input.employeeId,
      locationId: input.locationId,
      days: input.days,
      expectedVersion,
    },
    input.chaos,
  );

  if (!filed.ok) {
    await handleFilingError(filed.error, clientId, input, deps);
    return;
  }

  ledger.getState().attachHcmId(clientId, filed.value.id);
  dispatch(clientId, { type: "HCM_ACCEPTED" });
  dispatch(clientId, { type: "VERIFY_START" });

  // Trust-but-verify (TRD §5): the 2xx is only a claim. Read back the
  // request record AND the authoritative cell; chaos never applies here —
  // verification reads must be plain truth.
  const [requestRead, cellRead] = await Promise.all([
    hcmApi.getRequest(filed.value.id),
    hcmApi.getCell(input.employeeId, input.locationId),
  ]);

  if (cellRead.ok) {
    mergeCell(queryClient, cellRead.value);
  }

  const verified =
    requestRead.ok &&
    requestRead.value.status === "pending" &&
    cellRead.ok &&
    cellRead.value.version > expectedVersion;

  if (verified) {
    dispatch(clientId, { type: "VERIFY_MATCH" });
    notify({
      kind: "request_confirmed",
      message: `Request for ${input.days} day(s) filed — awaiting manager approval.`,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.requestsRoot });
  } else {
    dispatch(clientId, { type: "VERIFY_MISMATCH" });
    notifyContradiction(
      notify,
      "HCM accepted the request but its records do not reflect it. You can retry or discard.",
    );
  }
}

async function handleFilingError(
  error: ApiError,
  clientId: string,
  input: SubmitInput,
  deps: SubmitDeps,
): Promise<void> {
  const dispatch = deps.ledger.getState().dispatch;

  switch (error) {
    case "version_conflict": {
      dispatch(clientId, { type: "HCM_CONFLICT" });
      // Re-read so the user retries against the balance that beat them.
      const fresh = await hcmApi.getCell(input.employeeId, input.locationId);
      if (fresh.ok) {
        mergeCell(deps.queryClient, fresh.value);
      }
      notifyContradiction(
        deps.notify,
        "The balance changed while you were filing. Review the new balance and retry.",
      );
      return;
    }
    case "insufficient_balance":
    case "invalid_dimensions": {
      const reason: RejectionReason = error;
      dispatch(clientId, { type: "HCM_REJECTED", reason });
      deps.notify({
        kind: "request_denied",
        message:
          error === "insufficient_balance"
            ? "HCM rejected the request: not enough days available."
            : "HCM rejected the request: invalid employee/location combination.",
      });
      return;
    }
    default: {
      // Timeouts, 5xx, malformed payloads: we cannot know what HCM did.
      // Contradicted-as-silent keeps the request recoverable (TRD §6.5 —
      // writes are never blindly retried).
      dispatch(clientId, { type: "HCM_SILENT" });
      notifyContradiction(
        deps.notify,
        "HCM did not answer clearly. The request was kept so you can retry or discard.",
      );
    }
  }
}

function notifyContradiction(notify: Notify, message: string): void {
  notify({ kind: "request_contradicted", message });
}
