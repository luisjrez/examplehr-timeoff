import type { ReactElement } from "react";

import type { BalanceCellView } from "@/domain/types";

import { ProvenanceBadge } from "./ProvenanceBadge";

interface BalanceCellCardProps {
  readonly locationName: string;
  readonly view: BalanceCellView;
  readonly isLoading: boolean;
}

/**
 * One balance row (employee × location). The big number is the PROJECTION;
 * whenever a hold is in flight the confirmed/pending split is disclosed
 * right under it — optimism with provenance, never a lie (TRD §3.1-C).
 */
export function BalanceCellCard({
  locationName,
  view,
  isLoading,
}: BalanceCellCardProps): ReactElement {
  if (!view.confirmed && isLoading) {
    return (
      <div
        role="status"
        aria-label={`Loading balance for ${locationName}`}
        className="animate-pulse rounded-xl border border-gray-200 p-4"
      >
        <div className="mb-3 h-4 w-24 rounded bg-gray-200" />
        <div className="h-10 w-16 rounded bg-gray-200" />
      </div>
    );
  }

  const heldDays = view.pending.reduce((sum, request) => sum + request.days, 0);

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">{locationName}</h3>
        <ProvenanceBadge staleness={view.staleness} />
      </div>
      <p className="text-4xl font-semibold tabular-nums">{view.projected}</p>
      <p className="text-xs text-gray-500">days available</p>
      {heldDays > 0 && view.confirmed ? (
        <p className="mt-2 text-xs text-gray-600">
          {view.confirmed.days} confirmed by HCM · −{heldDays} pending
          confirmation
        </p>
      ) : null}
      {view.confirmed ? (
        <p className="mt-1 text-[11px] text-gray-400">
          confirmed at {new Date(view.confirmed.updatedAt).toLocaleTimeString()}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-red-500">never confirmed by HCM</p>
      )}
    </div>
  );
}
