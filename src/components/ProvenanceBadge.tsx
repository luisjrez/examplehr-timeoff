import type { ReactElement } from "react";

import type { Staleness } from "@/domain/types";

interface ProvenanceBadgeProps {
  readonly staleness: Staleness;
}

const BADGE_STYLES: Readonly<Record<Staleness, string>> = {
  fresh:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  aging: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  stale: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

const BADGE_LABELS: Readonly<Record<Staleness, string>> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
};

/**
 * Surfaces how trustworthy a confirmed value currently is (TRD §6.5).
 * The UI never blocks on HCM being slow — it labels the data instead.
 */
export function ProvenanceBadge({
  staleness,
}: ProvenanceBadgeProps): ReactElement {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[staleness]}`}
    >
      {BADGE_LABELS[staleness]}
    </span>
  );
}
