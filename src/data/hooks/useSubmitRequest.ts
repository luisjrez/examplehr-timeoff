"use client";

import { useMutation } from "@tanstack/react-query";

import type { ChaosInjection } from "../hcmApi";
import { submitTimeOffRequest } from "../submitFlow";
import { useSubmitDeps } from "./useSubmitDeps";

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
