"use client";

import { useQuery } from "@tanstack/react-query";

import type { HcmRequestRecord } from "@/domain/types";

import { hcmApi } from "../hcmApi";
import { queryKeys } from "../queryKeys";
import { PENDING_REQUESTS_POLL_MS } from "./pollingConfig";

/** Manager: pending requests, polled — approvals must not go stale quietly. */
export function usePendingRequests(): {
  readonly requests: readonly HcmRequestRecord[];
  readonly isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.requests("pending"),
    queryFn: async () => {
      const result = await hcmApi.listRequests("pending");
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.value;
    },
    refetchInterval: PENDING_REQUESTS_POLL_MS,
  });
  return { requests: query.data ?? [], isLoading: query.isPending };
}
