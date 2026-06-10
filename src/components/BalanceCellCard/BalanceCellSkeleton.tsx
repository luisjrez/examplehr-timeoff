import type { ReactElement } from "react";

import { Skeleton } from "../Skeleton";

/**
 * Loading placeholder for a balance cell card (employee grid).
 * Mirrors BalanceCellCard's layout so content does not jump when it lands.
 */
export function BalanceCellSkeleton(): ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading balance"
      className="rounded-xl border border-gray-200 dark:border-zinc-700 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-10 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}
