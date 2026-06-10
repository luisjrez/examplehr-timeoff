import type { ReactElement } from "react";

import { Skeleton } from "../Skeleton";
import { Card } from "../ui/Card";

/**
 * Loading placeholder for the request form: locations come from the corpus,
 * so the form is not actionable until hydration. Mirrors RequestForm's layout.
 */
export function RequestFormSkeleton(): ReactElement {
  return (
    <Card
      rounded="xl"
      padding="4"
      className="flex flex-wrap items-end gap-3"
      role="status"
      aria-label="Loading request form"
    >
      <div className="flex flex-col gap-1">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-8 w-36 rounded-md" />
      </div>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
      <Skeleton className="h-9 w-36 rounded-md" />
    </Card>
  );
}
