"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { applyCorpus } from "../applyCorpus";
import { hcmApi } from "../hcmApi";
import { useNotificationsStore } from "../notifications";
import { queryKeys } from "../queryKeys";
import { CORPUS_RECONCILE_INTERVAL_MS } from "./pollingConfig";

/**
 * Hydrates and periodically reconciles the confirmed layer from the corpus
 * endpoint (TRD §6.2): expensive, so exactly one query at a slow cadence,
 * fanned out into per-cell keys via applyCorpus. With SSE connected this is
 * the safety net, not the primary delivery path.
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
