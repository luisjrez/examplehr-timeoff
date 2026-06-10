import type { QueryClient } from "@tanstack/react-query";

import type { HcmRequestRecord } from "@/domain/types";

import { mergeCell } from "./applyCorpus";
import { hcmApi } from "./hcmApi";
import type { Notify } from "./notifications";
import { queryKeys } from "./queryKeys";

/**
 * Manager decision flow (TRD §7). The decision carries the cell version the
 * manager was actually shown; HCM's CAS turns "the balance moved since you
 * looked" into a structural 409 instead of a silent wrong approval.
 */
export interface DecideDeps {
  readonly queryClient: QueryClient;
  readonly notify: Notify;
}

export interface DecideInput {
  readonly id: string;
  readonly decision: "approve" | "deny";
  readonly expectedCellVersion: number;
}

export type DecideOutcome =
  | { readonly kind: "decided"; readonly record: HcmRequestRecord }
  | { readonly kind: "version_conflict" }
  | { readonly kind: "failed" };

export async function decideOnRequest(
  input: DecideInput,
  deps: DecideDeps,
): Promise<DecideOutcome> {
  const result = await hcmApi.decideRequest(
    input.id,
    input.decision,
    input.expectedCellVersion,
  );

  if (result.ok) {
    // Deny refunds the hold, so the cell changed; re-read truth either way.
    await refreshCellFor(result.value, deps.queryClient);
    await deps.queryClient.invalidateQueries({
      queryKey: queryKeys.requestsRoot,
    });
    return { kind: "decided", record: result.value };
  }

  if (result.error === "version_conflict") {
    const record = await hcmApi.getRequest(input.id);
    if (record.ok) {
      await refreshCellFor(record.value, deps.queryClient);
    }
    deps.notify({
      kind: "decision_conflict",
      message:
        "The balance changed since you opened this request. Review the fresh balance before deciding.",
    });
    return { kind: "version_conflict" };
  }

  deps.notify({
    kind: "decision_conflict",
    message: "HCM could not process the decision. Try again.",
  });
  return { kind: "failed" };
}

async function refreshCellFor(
  record: HcmRequestRecord,
  queryClient: QueryClient,
): Promise<void> {
  const fresh = await hcmApi.getCell(record.employeeId, record.locationId);
  if (fresh.ok) {
    mergeCell(queryClient, fresh.value);
  }
}
