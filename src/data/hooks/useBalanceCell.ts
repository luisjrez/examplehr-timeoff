"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { projectCell } from "@/domain/projection";
import type { BalanceCellView } from "@/domain/types";

import { hcmApi } from "../hcmApi";
import { queryKeys } from "../queryKeys";
import { freshnessOf, useSyncStatusStore } from "../syncStatus";
import { CELL_STALE_TIME_MS } from "./pollingConfig";
import { useLedgerRequests } from "./useLedgerRequests";

/**
 * The projection the UI renders for one cell (TRD §4): confirmed truth from
 * the query cache + this session's overlay, composed by the pure projector.
 */
export function useBalanceCell(
  employeeId: string,
  locationId: string,
  options?: { readonly freshness?: "grid" | "decision" },
): BalanceCellView & { readonly isLoading: boolean } {
  const requests = useLedgerRequests(employeeId, locationId);
  const live = useSyncStatusStore((s) => s.live);

  const cellQuery = useQuery({
    queryKey: queryKeys.cell(employeeId, locationId),
    queryFn: async () => {
      const result = await hcmApi.getCell(employeeId, locationId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.value;
    },
    // Decision contexts (manager panel) must read fresh truth every time.
    staleTime: options?.freshness === "decision" ? 0 : CELL_STALE_TIME_MS,
  });

  // Cache subscription only (enabled: false — never fetches from here):
  // a successful corpus reconciliation is a sync proof for EVERY cell.
  const corpusQuery = useQuery({
    queryKey: queryKeys.corpus,
    queryFn: () => Promise.reject(new Error("corpus is fetched elsewhere")),
    enabled: false,
  });

  // Clock as state (render purity) + heartbeat so the badge can degrade on
  // an otherwise idle page (e.g. the SSE channel quietly died).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const view = useMemo(() => {
    const projected = projectCell(cellQuery.data, requests, new Date(nowMs));
    return {
      ...projected,
      // Freshness is a property of the sync channel, not of HCM's mutation
      // timestamp (the projection's fallback) — see syncStatus.ts.
      staleness: cellQuery.data
        ? freshnessOf({
            live,
            nowMs,
            cellSyncedAtMs: cellQuery.dataUpdatedAt,
            corpusSyncedAtMs: corpusQuery.dataUpdatedAt,
          })
        : projected.staleness,
    };
  }, [
    cellQuery.data,
    cellQuery.dataUpdatedAt,
    corpusQuery.dataUpdatedAt,
    requests,
    live,
    nowMs,
  ]);

  return { ...view, isLoading: cellQuery.isPending };
}
