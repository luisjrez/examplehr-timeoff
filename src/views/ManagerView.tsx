"use client";

import { useCallback, useState, type ReactElement } from "react";

import type { HcmRequestRecord } from "@/domain/types";
import {
  useBalanceCell,
  useDecideRequest,
  usePendingRequests,
} from "@/data/hooks";
import { DecisionPanel } from "@/components/DecisionPanel";
import { ReconciliationToaster } from "@/components/ReconciliationToaster";

interface PendingRequestSectionProps {
  readonly request: HcmRequestRecord;
}

/**
 * One pending request with its decision context. Opening this section IS the
 * fresh read (freshness: "decision" → staleTime 0); the decision carries the
 * version of exactly what the manager saw (TRD §7).
 */
function PendingRequestSection({
  request,
}: PendingRequestSectionProps): ReactElement {
  const { isLoading, ...cellView } = useBalanceCell(
    request.employeeId,
    request.locationId,
    { freshness: "decision" },
  );
  const { decide, isDeciding } = useDecideRequest();
  const [conflict, setConflict] = useState(false);

  const runDecision = useCallback(
    async (decision: "approve" | "deny") => {
      const version = cellView.confirmed?.version;
      if (version === undefined) {
        return;
      }
      const outcome = await decide({
        id: request.id,
        decision,
        expectedCellVersion: version,
      });
      // A conflict re-arms the panel: decideFlow already refreshed the cell
      // cache, so the numbers on screen are the new truth.
      setConflict(outcome.kind === "version_conflict");
    },
    [decide, request.id, cellView.confirmed?.version],
  );

  const handleApprove = useCallback(() => {
    void runDecision("approve");
  }, [runDecision]);

  const handleDeny = useCallback(() => {
    void runDecision("deny");
  }, [runDecision]);

  return (
    <DecisionPanel
      request={request}
      cellView={cellView}
      isCellLoading={isLoading}
      isDeciding={isDeciding}
      conflict={conflict}
      onApprove={handleApprove}
      onDeny={handleDeny}
    />
  );
}

/** Manager container: pending queue with balance context at decision time. */
export function ManagerView(): ReactElement {
  const { requests, isLoading } = usePendingRequests();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Pending approvals</h1>
        <p className="text-sm text-gray-600 dark:text-zinc-300">
          Balances shown are read from HCM at decision time, not cached.
        </p>
      </header>

      <section aria-label="Pending requests" className="flex flex-col gap-3">
        {isLoading ? (
          <p role="status" className="text-sm text-gray-500 dark:text-zinc-400">
            Loading pending requests…
          </p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            No requests waiting for review.
          </p>
        ) : (
          requests.map((request) => (
            <PendingRequestSection key={request.id} request={request} />
          ))
        )}
      </section>

      <ReconciliationToaster />
    </main>
  );
}
