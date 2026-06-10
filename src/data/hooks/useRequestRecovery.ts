"use client";

import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";

import { discardRequest, retryRequest } from "../submitFlow";
import { useSubmitDeps } from "./useSubmitDeps";

/** Recovery affordances for contradicted requests (retry / discard). */
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
