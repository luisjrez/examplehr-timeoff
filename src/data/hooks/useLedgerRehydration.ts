"use client";

import { useEffect, useRef } from "react";

import { reconcileRehydratedLedger } from "../rehydration";
import { useSubmitDeps } from "./useSubmitDeps";

/**
 * One-shot boot reconciliation of the persisted ledger (plan-0001 phase-2):
 * rehydrated in-flight requests re-verify against HCM before the overlay is
 * allowed to subtract their holds — see reconcileRehydratedLedger.
 */
export function useLedgerRehydration(): void {
  const deps = useSubmitDeps();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;
    void reconcileRehydratedLedger(deps);
  }, [deps]);
}
