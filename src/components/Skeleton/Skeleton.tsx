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
