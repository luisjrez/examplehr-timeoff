"use client";

import { useEffect, useRef } from "react";

import { appLedger } from "../requestLedger";
import { reconcileRehydratedLedger } from "../rehydration";
import { useSubmitDeps } from "./useSubmitDeps";

/**
 * One-shot boot of the persisted ledger (plan-0001 phase-2), AFTER mount:
 * 1. rehydrate from localStorage (persist uses skipHydration so the first
 *    client render matches the server HTML — no hydration mismatch);
 * 2. re-verify rehydrated in-flight requests against HCM before the overlay
 *    is allowed to subtract their holds — see reconcileRehydratedLedger.
 */
export function useLedgerRehydration(): void {
  const deps = useSubmitDeps();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;
    void (async () => {
      await appLedger.persist.rehydrate();
      await reconcileRehydratedLedger(deps);
    })();
  }, [deps]);
}
