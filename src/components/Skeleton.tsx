import type { ReactElement } from "react";

interface SkeletonProps {
  /** Tailwind sizing/shape classes (height, width, rounding overrides). */
  readonly className?: string;
}

/** Shimmer placeholder block — compose these into layout-true skeletons. */
export function Skeleton({ className = "" }: SkeletonProps): ReactElement {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded bg-gray-200 dark:bg-zinc-700 ${className}`}
    />
  );
}

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

/**
 * Loading placeholder for a balance cell card (employee grid).
 * Mirrors BalanceCellCard's layout.
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
