import type { ReactElement } from "react";

import { Skeleton } from "../Skeleton";
import { Card } from "../ui/Card";

/**
 * Loading placeholder for a balance cell card (employee grid).
 * Mirrors BalanceCellCard's layout so content does not jump when it lands.
 */
export function BalanceCellSkeleton(): ReactElement {
  return (
    <Card rounded="xl" padding="4" role="status" aria-label="Loading balance">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-10 w-16" />
      <Skeleton className="h-3 w-20" />
    </Card>
  );
}
