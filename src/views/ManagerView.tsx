"use client";

import { useCallback, useState, type ReactElement } from "react";

import type { HcmRequestRecord } from "@/domain/types";
import {
  useBalanceCell,
  useDecideRequest,
  usePendingRequests,
  useRealtimeHcm,
} from "@/data/hooks";
import {
  DecisionPanel,
  DecisionPanelSkeleton,
} from "@/components/DecisionPanel";
import { ReconciliationToaster } from "@/components/ReconciliationToaster";
import { SyncModeBadge } from "@/components/SyncModeBadge";
import { MutedText } from "@/components/ui/MutedText";
import { ViewSection } from "@/components/ui/ViewSection";

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
  // Request events stream in live: new filings appear without waiting a poll.
  const { live } = useRealtimeHcm();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          Pending approvals
          <SyncModeBadge live={live} />
        </h1>
        <p className="text-sm text-gray-600 dark:text-zinc-300">
          Balances shown are read from HCM at decision time, not cached.
        </p>
      </header>

      <ViewSection ariaLabel="Pending requests" className="flex flex-col gap-3">
        {isLoading ? (
          <div role="status" aria-label="Loading pending requests">
            <span className="sr-only">Loading pending requests…</span>
            <div className="flex flex-col gap-3">
              <DecisionPanelSkeleton />
              <DecisionPanelSkeleton />
            </div>
          </div>
        ) : requests.length === 0 ? (
          <MutedText>No requests waiting for review.</MutedText>
        ) : (
          requests.map((request) => (
            <PendingRequestSection key={request.id} request={request} />
          ))
        )}
      </ViewSection>

      <ReconciliationToaster />
    </main>
  );
}
