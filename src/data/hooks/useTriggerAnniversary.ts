"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { applyCorpus } from "../applyCorpus";
import { hcmApi } from "../hcmApi";
import { useNotificationsStore } from "../notifications";

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
