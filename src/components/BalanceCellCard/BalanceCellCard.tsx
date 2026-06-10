"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";

import type { BalanceCellView } from "@/domain/types";

import { ProvenanceBadge } from "../ProvenanceBadge";
import { Card } from "../ui/Card";
import { BalanceCellSkeleton } from "./BalanceCellSkeleton";

interface BalanceCellCardProps {
  readonly locationName: string;
  readonly view: BalanceCellView;
  readonly isLoading: boolean;
}

const FLASH_DURATION_MS = 900;

type Flash = "up" | "down" | undefined;

/**
 * Narrates value changes instead of letting the number teleport: a short
 * tinted flash (emerald up, amber down) makes optimistic applies and
 * rollbacks read as intentional transitions, not glitches.
 */
function useValueFlash(value: number): Flash {
  const previous = useRef(value);
  const [flash, setFlash] = useState<Flash>(undefined);

  useEffect(() => {
    if (previous.current === value) {
      return undefined;
    }
    setFlash(value > previous.current ? "up" : "down");
    previous.current = value;
    const timer = setTimeout(() => setFlash(undefined), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return flash;
}

const FLASH_STYLES: Readonly<Record<"up" | "down", string>> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-amber-600 dark:text-amber-400",
};

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
  const flash = useValueFlash(view.projected);

  if (!view.confirmed && isLoading) {
    return <BalanceCellSkeleton />;
  }

  const heldDays = view.pending.reduce((sum, request) => sum + request.days, 0);
  const verifying = heldDays > 0;

  return (
    <Card rounded="xl" padding="4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-200">
          {locationName}
        </h3>
        <ProvenanceBadge staleness={view.staleness} />
      </div>
      <p
        className={`text-4xl font-semibold tabular-nums transition-colors duration-500 ${
          flash ? FLASH_STYLES[flash] : ""
        }`}
      >
        {view.projected}
      </p>
      <p className="text-xs text-gray-500 dark:text-zinc-400">days available</p>
      {verifying && view.confirmed ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-600 dark:text-zinc-300">
          {/* Pulse while the hold is unverified: the rollback, if it comes,
              reads as "the hold was released", not as a glitch. */}
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          {view.confirmed.days} confirmed by HCM · −{heldDays} pending
          confirmation
        </p>
      ) : null}
      {view.confirmed ? (
        <p className="mt-1 text-[11px] text-gray-400 dark:text-zinc-500">
          synced from HCM at{" "}
          {new Date(view.confirmed.updatedAt).toLocaleTimeString()}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-red-500">never confirmed by HCM</p>
      )}
    </Card>
  );
}
