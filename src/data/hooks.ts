"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { projectCell } from "@/domain/projection";
import type { BalanceCellView, HcmRequestRecord } from "@/domain/types";

import { applyCorpus } from "./applyCorpus";
import { hcmApi, type ChaosInjection } from "./hcmApi";
import { useNotificationsStore } from "./notifications";
import { queryKeys } from "./queryKeys";
import { appLedger, type LedgerRequest } from "./requestLedger";
import {
  discardRequest,
  retryRequest,
  submitTimeOffRequest,
  type SubmitDeps,
} from "./submitFlow";
import { decideOnRequest, type DecideOutcome } from "./decideFlow";

/**
 * React bindings for the data layer. Deliberately thin: every decision worth
 * testing lives in the framework-free flows; these hooks only wire stores,
 * query cache and components together (TRD §8 layering).
 */

const CORPUS_RECONCILE_INTERVAL_MS = 60_000;
const CELL_STALE_TIME_MS = 15_000;
const PENDING_REQUESTS_POLL_MS = 10_000;

function useSubmitDeps(): SubmitDeps {
  const queryClient = useQueryClient();
  const notify = useNotificationsStore((s) => s.push);
  return useMemo(
    () => ({ queryClient, ledger: appLedger, notify }),
    [queryClient, notify],
  );
}

/**
 * Hydrates and periodically reconciles the confirmed layer from the corpus
 * endpoint (TRD §6.2): expensive, so exactly one query at a slow cadence,
 * fanned out into per-cell keys via applyCorpus.
 */
export function useCorpusReconciliation(): { readonly hydrated: boolean } {
  const queryClient = useQueryClient();
  const notify = useNotificationsStore((s) => s.push);

  const corpus = useQuery({
    queryKey: queryKeys.corpus,
    queryFn: async () => {
      const result = await hcmApi.getCorpus();
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.value;
    },
    refetchInterval: CORPUS_RECONCILE_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const cells = corpus.data;
  useEffect(() => {
    if (cells) {
      applyCorpus(queryClient, cells, notify);
    }
  }, [cells, queryClient, notify]);

  return { hydrated: corpus.isSuccess };
}

const EMPTY_REQUESTS: readonly LedgerRequest[] = [];

/** Subscribe to this session's ledger requests for one cell. */
export function useLedgerRequests(
  employeeId: string,
  locationId?: string,
): readonly LedgerRequest[] {
  const snapshot = useSyncExternalStore(
    appLedger.subscribe,
    () => appLedger.getState().requests,
    () => appLedger.getState().requests,
  );
  return useMemo(() => {
    const all = Object.values(snapshot).filter(
      (r) =>
        r.employeeId === employeeId &&
        (locationId === undefined || r.locationId === locationId),
    );
    return all.length > 0 ? all : EMPTY_REQUESTS;
  }, [snapshot, employeeId, locationId]);
}

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

export interface SubmitRequestVariables {
  readonly employeeId: string;
  readonly locationId: string;
  readonly days: number;
  readonly chaos?: ChaosInjection;
}

/** Files a request through the verification flow (TRD §5). */
export function useSubmitRequest(): {
  readonly submit: (variables: SubmitRequestVariables) => void;
  readonly isSubmitting: boolean;
} {
  const deps = useSubmitDeps();
  const mutation = useMutation({
    mutationFn: (variables: SubmitRequestVariables) =>
      submitTimeOffRequest(variables, deps),
  });
  return { submit: mutation.mutate, isSubmitting: mutation.isPending };
}

/** Recovery affordances for contradicted requests. */
export function useRequestRecovery(): {
  readonly retry: (clientId: string) => void;
  readonly discard: (clientId: string) => void;
} {
  const deps = useSubmitDeps();
  const retryMutation = useMutation({
    mutationFn: (clientId: string) => retryRequest(clientId, deps),
  });
  const discard = useCallback(
    (clientId: string) => discardRequest(clientId, deps),
    [deps],
  );
  return { retry: retryMutation.mutate, discard };
}

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

export interface DecideVariables {
  readonly id: string;
  readonly decision: "approve" | "deny";
  readonly expectedCellVersion: number;
}

/** Manager decision, version-gated (TRD §7). */
export function useDecideRequest(): {
  readonly decide: (variables: DecideVariables) => Promise<DecideOutcome>;
  readonly isDeciding: boolean;
} {
  const queryClient = useQueryClient();
  const notify = useNotificationsStore((s) => s.push);
  const mutation = useMutation({
    mutationFn: (variables: DecideVariables) =>
      decideOnRequest(variables, { queryClient, notify }),
  });
  return { decide: mutation.mutateAsync, isDeciding: mutation.isPending };
}

/** Demo helper: fire the anniversary bonus and let reconciliation surface it. */
export function useTriggerAnniversary(): {
  readonly trigger: (employeeId: string) => void;
  readonly isTriggering: boolean;
} {
  const queryClient = useQueryClient();
  const notify = useNotificationsStore((s) => s.push);
  const mutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const result = await hcmApi.triggerAnniversary(employeeId);
      if (result.ok) {
        // Surface the change immediately instead of waiting for the next poll.
        applyCorpus(queryClient, result.value, notify);
      }
    },
  });
  return { trigger: mutation.mutate, isTriggering: mutation.isPending };
}
