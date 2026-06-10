"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { hcmApi } from "../hcmApi";
import { useNotificationsStore } from "../notifications";
import { queryKeys } from "../queryKeys";
import { appLedger } from "../requestLedger";
import { syncDecisions } from "../syncDecisions";
import { DECISION_SYNC_POLL_MS } from "./pollingConfig";

/**
 * Employee side of the manager loop: polls request records and folds
 * decisions into the session ledger via the FSM's MANAGER_* events.
 */
export function useDecisionSync(): void {
  const queryClient = useQueryClient();
  const notify = useNotificationsStore((s) => s.push);
  const query = useQuery({
    queryKey: queryKeys.requestsRoot,
    queryFn: async () => {
      const result = await hcmApi.listRequests();
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.value;
    },
    refetchInterval: DECISION_SYNC_POLL_MS,
  });

  const records = query.data;
  useEffect(() => {
    if (!records) {
      return;
    }
    const decided = syncDecisions(appLedger, records, notify);
    // A denial refunded its hold at HCM — re-read those cells now instead
    // of leaving a stale number until the next corpus reconciliation.
    for (const request of decided) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.cell(request.employeeId, request.locationId),
      });
    }
  }, [records, notify, queryClient]);
}
