import type { ReactElement } from "react";

import type { BalanceCellView, HcmRequestRecord } from "@/domain/types";

import { ProvenanceBadge } from "../ProvenanceBadge";
import { Skeleton } from "../Skeleton";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

interface DecisionPanelProps {
  readonly request: HcmRequestRecord;
  readonly cellView: BalanceCellView;
  readonly isCellLoading: boolean;
  readonly isDeciding: boolean;
  /** True when HCM rejected a decision because the balance moved (409). */
  readonly conflict: boolean;
  readonly onApprove: () => void;
  readonly onDeny: () => void;
}

/**
 * The manager decides HERE, against the balance shown HERE (TRD §7).
 * Buttons stay disabled until the fresh authoritative read lands; a version
 * conflict re-arms the panel with the new truth instead of approving blind.
 */
export function DecisionPanel({
  request,
  cellView,
  isCellLoading,
  isDeciding,
  conflict,
  onApprove,
  onDeny,
}: DecisionPanelProps): ReactElement {
  const disabled = isCellLoading || isDeciding || !cellView.confirmed;

  return (
    <Card rounded="lg" padding="4" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          <span className="font-medium">{request.employeeId}</span> requests{" "}
          <span className="font-medium">{request.days} day(s)</span> at{" "}
          {request.locationId}
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-md bg-gray-50 dark:bg-zinc-800/70 p-2 text-sm">
        {isCellLoading || !cellView.confirmed ? (
          <span role="status" className="flex w-full items-center gap-2">
            <span className="sr-only">Reading current balance from HCM…</span>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </span>
        ) : (
          <>
            <span>
              Balance right now:{" "}
              <span className="font-semibold tabular-nums">
                {cellView.confirmed.days}
              </span>{" "}
              day(s)
            </span>
            <ProvenanceBadge staleness={cellView.staleness} />
          </>
        )}
      </div>

      {!isCellLoading && cellView.confirmed ? (
        // Hold semantics made legible (the user-reported confusion): the
        // requested days were deducted at filing, so approving does NOT move
        // the number and denying refunds it. Spell out both outcomes.
        <p className="text-xs text-gray-600 dark:text-zinc-300">
          The {request.days} day(s) requested are already on hold. Approve keeps
          the balance at {cellView.confirmed.days} · Deny refunds it to{" "}
          {cellView.confirmed.days + request.days}.
        </p>
      ) : null}

      {conflict ? (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          The balance changed since you opened this request — the numbers above
          were refreshed. Review them before deciding.
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="success"
          size="sm"
          onClick={onApprove}
          disabled={disabled}
        >
          Approve
        </Button>
        <Button variant="danger" size="sm" onClick={onDeny} disabled={disabled}>
          Deny
        </Button>
      </div>
    </Card>
  );
}
