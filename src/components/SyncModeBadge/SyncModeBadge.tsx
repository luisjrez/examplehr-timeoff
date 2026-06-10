import type { ReactElement } from "react";

import { Chip } from "../ui/Chip";

interface SyncModeBadgeProps {
  readonly live: boolean;
}

/**
 * Discloses the data-freshness mode (SSE push vs periodic-sync fallback).
 * Was copy-pasted verbatim in both views — now one source of truth.
 */
export function SyncModeBadge({ live }: SyncModeBadgeProps): ReactElement {
  return (
    <Chip
      size="2xs"
      className={
        live
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
          : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300"
      }
    >
      {live ? "● Live" : "○ Periodic sync"}
    </Chip>
  );
}
