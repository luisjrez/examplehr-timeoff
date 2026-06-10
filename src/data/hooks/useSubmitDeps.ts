"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useNotificationsStore } from "../notifications";
import { appLedger } from "../requestLedger";
import type { SubmitDeps } from "../submitFlow";

/** Shared dependency bundle for the submit/recovery flows. Internal. */
export function useSubmitDeps(): SubmitDeps {
  const queryClient = useQueryClient();
  const notify = useNotificationsStore((s) => s.push);
  return useMemo(
    () => ({ queryClient, ledger: appLedger, notify }),
    [queryClient, notify],
  );
}
