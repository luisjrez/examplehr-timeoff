"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { decideOnRequest, type DecideOutcome } from "../decideFlow";
import { useNotificationsStore } from "../notifications";

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
