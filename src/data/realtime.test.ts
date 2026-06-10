import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import type { BalanceCell } from "@/domain/types";

import { reconcileRealtimeEvent } from "./realtime";
import { createLedgerStore } from "./requestLedger";
import { queryKeys } from "./queryKeys";

const EMP = "emp-alice";
const LOC = "loc-mx";

function cell(days: number, version: number): BalanceCell {
  return {
    employeeId: EMP,
    locationId: LOC,
    days,
    version,
    updatedAt: "2026-06-10T12:00:00Z",
  };
}

function payload(c: BalanceCell): string {
  return JSON.stringify({ type: "cell", cell: c });
}

function harness(initial?: BalanceCell) {
  const queryClient = new QueryClient();
  if (initial) {
    queryClient.setQueryData(queryKeys.cell(EMP, LOC), initial);
  }
  const ledger = createLedgerStore();
  const notify = vi.fn();
  return { queryClient, ledger, notify };
}

describe("reconcileRealtimeEvent", () => {
  it("should merge an external change into the cache and narrate it", () => {
    const h = harness(cell(12, 1));

    reconcileRealtimeEvent(
      h.queryClient,
      h.ledger,
      payload(cell(13, 2)),
      h.notify,
    );

    expect(h.queryClient.getQueryData(queryKeys.cell(EMP, LOC))).toEqual(
      cell(13, 2),
    );
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "balance_changed", deltaDays: 1 }),
    );
  });

  it("should stay silent for a change explained by the user's own in-flight request", () => {
    // The SSE echo of our own write can beat the verification read; toasting
    // "balance changed" for the user's own action would be noise.
    const h = harness(cell(12, 1));
    h.ledger.getState().upsert({
      id: "client-1",
      employeeId: EMP,
      locationId: LOC,
      startDate: "2026-06-15",
      endDate: "2026-06-16",
      days: 2,
      phase: { status: "accepted_unverified" },
      createdAt: "2026-06-10T12:00:00Z",
    });

    reconcileRealtimeEvent(
      h.queryClient,
      h.ledger,
      payload(cell(10, 2)),
      h.notify,
    );

    expect(h.queryClient.getQueryData(queryKeys.cell(EMP, LOC))).toEqual(
      cell(10, 2),
    );
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("should never regress the cache to an older version", () => {
    const h = harness(cell(10, 5));

    reconcileRealtimeEvent(
      h.queryClient,
      h.ledger,
      payload(cell(12, 3)),
      h.notify,
    );

    expect(h.queryClient.getQueryData(queryKeys.cell(EMP, LOC))).toEqual(
      cell(10, 5),
    );
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("should ignore malformed or non-cell payloads without throwing", () => {
    const h = harness(cell(12, 1));

    reconcileRealtimeEvent(h.queryClient, h.ledger, "not json", h.notify);
    reconcileRealtimeEvent(
      h.queryClient,
      h.ledger,
      '{"type":"hello"}',
      h.notify,
    );
    reconcileRealtimeEvent(
      h.queryClient,
      h.ledger,
      '{"type":"cell","cell":{"bogus":true}}',
      h.notify,
    );

    expect(h.queryClient.getQueryData(queryKeys.cell(EMP, LOC))).toEqual(
      cell(12, 1),
    );
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("should fold a manager decision straight into the session ledger (multi-user sync)", () => {
    const h = harness(cell(9, 2));
    h.ledger.getState().upsert({
      id: "client-1",
      employeeId: EMP,
      locationId: LOC,
      startDate: "2026-06-15",
      endDate: "2026-06-17",
      days: 3,
      phase: { status: "pending_approval" },
      createdAt: "2026-06-10T12:00:00Z",
      hcmId: "req-0001",
    });

    reconcileRealtimeEvent(
      h.queryClient,
      h.ledger,
      JSON.stringify({
        type: "request",
        request: {
          id: "req-0001",
          employeeId: EMP,
          locationId: LOC,
          startDate: "2026-06-15",
          endDate: "2026-06-17",
          days: 3,
          status: "approved",
          filedAt: "2026-06-10T11:00:00Z",
          decidedAt: "2026-06-10T12:01:00Z",
        },
      }),
      h.notify,
    );

    expect(h.ledger.getState().requests["client-1"]?.phase.status).toBe(
      "approved",
    );
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "request_confirmed" }),
    );
  });

  it("should invalidate the request queries on any request event (manager queues refresh live)", () => {
    const h = harness(cell(12, 1));
    const invalidate = vi.spyOn(h.queryClient, "invalidateQueries");

    reconcileRealtimeEvent(
      h.queryClient,
      h.ledger,
      JSON.stringify({
        type: "request",
        request: {
          id: "req-0002",
          employeeId: EMP,
          locationId: LOC,
          startDate: "2026-06-15",
          endDate: "2026-06-15",
          days: 1,
          status: "pending",
          filedAt: "2026-06-10T11:00:00Z",
        },
      }),
      h.notify,
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.requestsRoot,
    });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("should seed an unknown cell silently (first sight, nothing to compare)", () => {
    const h = harness();

    reconcileRealtimeEvent(
      h.queryClient,
      h.ledger,
      payload(cell(12, 1)),
      h.notify,
    );

    expect(h.queryClient.getQueryData(queryKeys.cell(EMP, LOC))).toEqual(
      cell(12, 1),
    );
    expect(h.notify).not.toHaveBeenCalled();
  });
});
