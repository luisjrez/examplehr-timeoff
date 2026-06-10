import type { ReactElement } from "react";

import { Skeleton } from "../Skeleton";

/**
 * Loading placeholder for a pending-request decision card (manager queue).
 * Mirrors DecisionPanel's layout so content does not jump when it lands.
 */
export function DecisionPanelSkeleton(): ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading pending request"
      className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-zinc-700 p-4"
    >
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-9 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </div>
  );
}
