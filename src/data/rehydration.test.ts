import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { setupServer } from "msw/node";
import { QueryClient } from "@tanstack/react-query";

import { createHcmStore, type HcmStore } from "@/mocks/hcmStore";
import { buildHcmHandlers } from "@/mocks/mswHandlers";
import { projectCell } from "@/domain/projection";
import type { BalanceCell, RequestPhase } from "@/domain/types";

import { createLedgerStore, type LedgerStore } from "./requestLedger";
import { queryKeys } from "./queryKeys";
import { reconcileRehydratedLedger } from "./rehydration";
import type { AppNotificationInput } from "./notifications";

const EMP = "emp-alice";
const LOC = "loc-mx";

const hcm: HcmStore = createHcmStore();
const server = setupServer(...buildHcmHandlers(hcm));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ledger: LedgerStore = createLedgerStore();
  const notifications: AppNotificationInput[] = [];
  return {
    queryClient,
    ledger,
    notify: (n: AppNotificationInput) => notifications.push(n),
    notifications,
  };
}

function rehydrated(
  ledger: LedgerStore,
  phase: RequestPhase,
  hcmId?: string,
): void {
  ledger.getState().upsert({
    id: "client-1",
    employeeId: EMP,
    locationId: LOC,
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    days: 2,
    phase,
    createdAt: "2026-06-10T11:00:00Z",
    ...(hcmId === undefined ? {} : { hcmId }),
  });
}

describe("reconcileRehydratedLedger", () => {
  beforeEach(() => {
    hcm.reset();
  });

  it("should resume verification for a rehydrated in-flight filing — and never double-count", async () => {
    // The filing reached HCM (hold applied) before the reload.
    const version = hcm.getCell(EMP, LOC)?.version ?? -1;
    const filed = hcm.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      startDate: "2026-06-15",
      endDate: "2026-06-16",
      expectedVersion: version,
    });
    if (!filed.ok) {
      throw new Error("seed filing failed");
    }
    const h = harness();
    rehydrated(h.ledger, { status: "accepted_unverified" }, filed.value.id);

    await reconcileRehydratedLedger({
      queryClient: h.queryClient,
      ledger: h.ledger,
      notify: h.notify,
    });

    expect(h.ledger.getState().requests["client-1"]?.phase.status).toBe(
      "pending_approval",
    );
    // The projection must show HCM truth (10), NOT 10 − 2 again.
    const confirmed = h.queryClient.getQueryData<BalanceCell>(
      queryKeys.cell(EMP, LOC),
    );
    const requests = Object.values(h.ledger.getState().requests);
    expect(projectCell(confirmed, requests, new Date()).projected).toBe(10);
  });

  it("should fold an already-decided request straight to its outcome", async () => {
    const version = hcm.getCell(EMP, LOC)?.version ?? -1;
    const filed = hcm.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      startDate: "2026-06-15",
      endDate: "2026-06-16",
      expectedVersion: version,
    });
    if (!filed.ok) {
      throw new Error("seed filing failed");
    }
    hcm.decideRequest(filed.value.id, "approve", version + 1);

    const h = harness();
    rehydrated(h.ledger, { status: "verifying" }, filed.value.id);

    await reconcileRehydratedLedger({
      queryClient: h.queryClient,
      ledger: h.ledger,
      notify: h.notify,
    });

    expect(h.ledger.getState().requests["client-1"]?.phase.status).toBe(
      "approved",
    );
  });

  it("should contradict a rehydrated filing HCM has no record of", async () => {
    const h = harness();
    rehydrated(h.ledger, { status: "verifying" }, "req-ghost");

    await reconcileRehydratedLedger({
      queryClient: h.queryClient,
      ledger: h.ledger,
      notify: h.notify,
    });

    expect(h.ledger.getState().requests["client-1"]?.phase).toEqual({
      status: "contradicted",
      reason: "verify_mismatch",
    });
  });

  it("should contradict-as-silent a filing that never got an HCM id (crash mid-write)", async () => {
    const h = harness();
    rehydrated(h.ledger, { status: "submitting" });

    await reconcileRehydratedLedger({
      queryClient: h.queryClient,
      ledger: h.ledger,
      notify: h.notify,
    });

    expect(h.ledger.getState().requests["client-1"]?.phase).toEqual({
      status: "contradicted",
      reason: "hcm_silent",
    });
  });

  it("should leave settled and pending_approval requests untouched", async () => {
    const h = harness();
    const spy = vi.fn();
    h.ledger.getState().upsert({
      id: "client-a",
      employeeId: EMP,
      locationId: LOC,
      startDate: "2026-06-15",
      endDate: "2026-06-15",
      days: 1,
      phase: { status: "pending_approval" },
      createdAt: "2026-06-10T11:00:00Z",
      hcmId: "req-0001",
    });
    h.ledger.getState().upsert({
      id: "client-b",
      employeeId: EMP,
      locationId: LOC,
      startDate: "2026-06-15",
      endDate: "2026-06-15",
      days: 1,
      phase: { status: "approved" },
      createdAt: "2026-06-10T11:00:00Z",
      hcmId: "req-0002",
    });

    await reconcileRehydratedLedger({
      queryClient: h.queryClient,
      ledger: h.ledger,
      notify: spy,
    });

    expect(h.ledger.getState().requests["client-a"]?.phase.status).toBe(
      "pending_approval",
    );
    expect(h.ledger.getState().requests["client-b"]?.phase.status).toBe(
      "approved",
    );
  });
});
