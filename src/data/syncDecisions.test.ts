import { describe, expect, it, vi } from "vitest";

import type { HcmRequestRecord } from "@/domain/types";

import { createLedgerStore } from "./requestLedger";
import { syncDecisions } from "./syncDecisions";

function record(
  id: string,
  status: HcmRequestRecord["status"],
): HcmRequestRecord {
  return {
    id,
    employeeId: "emp-alice",
    locationId: "loc-mx",
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    days: 2,
    status,
    filedAt: "2026-06-10T12:00:00Z",
  };
}

function seedLedger(phaseStatus: "pending_approval" | "verifying") {
  const ledger = createLedgerStore();
  ledger.getState().upsert({
    id: "client-1",
    employeeId: "emp-alice",
    locationId: "loc-mx",
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    days: 2,
    phase: { status: phaseStatus },
    createdAt: "2026-06-10T12:00:00Z",
    hcmId: "req-0001",
  });
  return ledger;
}

describe("syncDecisions", () => {
  it("should move a verified filing to approved when the manager approved it", () => {
    const ledger = seedLedger("pending_approval");
    const notify = vi.fn();

    syncDecisions(ledger, [record("req-0001", "approved")], notify);

    expect(ledger.getState().requests["client-1"]?.phase.status).toBe(
      "approved",
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "request_confirmed" }),
    );
  });

  it("should move a verified filing to denied when the manager denied it", () => {
    const ledger = seedLedger("pending_approval");
    const notify = vi.fn();

    syncDecisions(ledger, [record("req-0001", "denied")], notify);

    expect(ledger.getState().requests["client-1"]?.phase.status).toBe("denied");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "request_denied" }),
    );
  });

  it("should not touch requests that are still verifying or still pending in HCM", () => {
    const ledger = seedLedger("verifying");
    const notify = vi.fn();

    syncDecisions(ledger, [record("req-0001", "approved")], notify);
    expect(ledger.getState().requests["client-1"]?.phase.status).toBe(
      "verifying",
    );

    const pendingLedger = seedLedger("pending_approval");
    syncDecisions(pendingLedger, [record("req-0001", "pending")], notify);
    expect(pendingLedger.getState().requests["client-1"]?.phase.status).toBe(
      "pending_approval",
    );
    expect(notify).not.toHaveBeenCalled();
  });
});
