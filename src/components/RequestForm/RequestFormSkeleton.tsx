import type { ReactElement } from "react";

import { Skeleton } from "../Skeleton";

/**
 * Loading placeholder for the request form: locations come from the corpus,
 * so the form is not actionable until hydration. Mirrors RequestForm's layout.
 */
export function RequestFormSkeleton(): ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading request form"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 dark:border-zinc-700 p-4"
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
    </div>
  );
}
