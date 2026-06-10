"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { projectCell } from "@/domain/projection";
import type { BalanceCellView } from "@/domain/types";

import { hcmApi } from "../hcmApi";
import { queryKeys } from "../queryKeys";
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

  const view = useMemo(
    () => projectCell(cellQuery.data, requests, new Date()),
    [cellQuery.data, requests],
  );

  return { ...view, isLoading: cellQuery.isPending };
}
