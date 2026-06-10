"use client";

import { useMemo, useSyncExternalStore } from "react";

import { appLedger, type LedgerRequest } from "../requestLedger";

const EMPTY_REQUESTS: readonly LedgerRequest[] = [];

/** Subscribe to this session's ledger requests for an employee (or one cell). */
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
