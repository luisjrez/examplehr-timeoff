import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { setupServer } from "msw/node";
import { QueryClient } from "@tanstack/react-query";

import { createHcmStore, type HcmStore } from "@/mocks/hcmStore";
import { buildHcmHandlers } from "@/mocks/mswHandlers";
import { cellKeyOf, type BalanceCell } from "@/domain/types";
import { projectCell } from "@/domain/projection";

import { createLedgerStore, type LedgerStore } from "./requestLedger";
import { queryKeys } from "./queryKeys";
import {
  discardRequest,
  retryRequest,
  submitTimeOffRequest,
  type SubmitDeps,
} from "./submitFlow";
import type { AppNotificationInput } from "./notifications";

const EMP = "emp-alice";
const LOC = "loc-mx";
const KEY = cellKeyOf(EMP, LOC);

const hcm: HcmStore = createHcmStore();
const server = setupServer(...buildHcmHandlers(hcm));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

interface Harness {
  readonly deps: SubmitDeps;
  readonly queryClient: QueryClient;
  readonly ledger: LedgerStore;
  readonly notifications: AppNotificationInput[];
  readonly view: () => ReturnType<typeof projectCell>;
}

function createHarness(): Harness {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ledger = createLedgerStore();
  const notifications: AppNotificationInput[] = [];

  // Pre-hydrate the cell cache like the corpus would (the flow reads the
  // cached version for its CAS expectedVersion).
  const cell = hcm.getCell(EMP, LOC);
  if (cell) {
    queryClient.setQueryData(queryKeys.cell(EMP, LOC), cell);
  }

  const deps: SubmitDeps = {
    queryClient,
    ledger,
    notify: (n) => notifications.push(n),
  };

  return {
    deps,
    queryClient,
    ledger,
    notifications,
    view: () => {
      const confirmed = queryClient.getQueryData<BalanceCell>(
        queryKeys.cell(EMP, LOC),
      );
      const requests = Object.values(ledger.getState().requests).filter(
        (r) => cellKeyOf(r.employeeId, r.locationId) === KEY,
      );
      return projectCell(confirmed, requests, new Date());
    },
  };
}

beforeEach(() => {
  hcm.reset();
});

describe("submitTimeOffRequest — happy path", () => {
  it("verifies the filing and folds the hold into confirmed (no double count)", async () => {
    const h = createHarness();

    await submitTimeOffRequest(
      {
        employeeId: EMP,
        locationId: LOC,
        startDate: "2026-06-15",
        endDate: "2026-06-16",
      },
      h.deps,
    );

    const requests = Object.values(h.ledger.getState().requests);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.phase.status).toBe("pending_approval");

    // Confirmed truth now includes the hold; overlay must be empty.
    const view = h.view();
    expect(view.confirmed?.days).toBe(10);
    expect(view.pending).toHaveLength(0);
    expect(view.projected).toBe(10);
  });
});

describe("submitTimeOffRequest — HCM lies (chaos)", () => {
  it("silent-failure: contradicts after verification and rolls the projection back", async () => {
    const h = createHarness();

    await submitTimeOffRequest(
      {
        employeeId: EMP,
        locationId: LOC,
        startDate: "2026-06-15",
        endDate: "2026-06-16",
        chaos: "silent-failure",
      },
      h.deps,
    );

    const request = Object.values(h.ledger.getState().requests)[0];
    expect(request?.phase).toEqual({
      status: "contradicted",
      reason: "verify_mismatch",
    });
    // Projection reflects HCM truth: nothing was ever debited.
    expect(h.view().projected).toBe(12);
    expect(h.notifications.some((n) => n.kind === "request_contradicted")).toBe(
      true,
    );
  });

  it("wrong-success: request exists but the hold never applied → contradicted", async () => {
    const h = createHarness();

    await submitTimeOffRequest(
      {
        employeeId: EMP,
        locationId: LOC,
        startDate: "2026-06-15",
        endDate: "2026-06-16",
        chaos: "wrong-success",
      },
      h.deps,
    );

    expect(Object.values(h.ledger.getState().requests)[0]?.phase).toEqual({
      status: "contradicted",
      reason: "verify_mismatch",
    });
    expect(h.view().projected).toBe(12);
  });

  it("conflict (version moved underneath): contradicted with version_conflict and cache refreshed", async () => {
    const h = createHarness();
    // The anniversary bonus lands after hydration but before our write.
    hcm.triggerAnniversary(EMP);

    await submitTimeOffRequest(
      {
        employeeId: EMP,
        locationId: LOC,
        startDate: "2026-06-15",
        endDate: "2026-06-16",
      },
      h.deps,
    );

    expect(Object.values(h.ledger.getState().requests)[0]?.phase).toEqual({
      status: "contradicted",
      reason: "version_conflict",
    });
    // The flow must re-read the cell so the user retries against fresh truth.
    expect(h.view().confirmed?.days).toBe(13);
    expect(h.view().projected).toBe(13);
  });

  it("hard transport error: request is contradicted as hcm_silent (recoverable), never lost", async () => {
    const h = createHarness();

    await submitTimeOffRequest(
      {
        employeeId: EMP,
        locationId: LOC,
        startDate: "2026-06-15",
        endDate: "2026-06-16",
        chaos: "error",
      },
      h.deps,
    );

    expect(Object.values(h.ledger.getState().requests)[0]?.phase).toEqual({
      status: "contradicted",
      reason: "hcm_silent",
    });
    expect(h.view().projected).toBe(12);
  });
});

describe("submitTimeOffRequest — clean rejections", () => {
  it("insufficient balance denies with the HCM reason", async () => {
    const h = createHarness();

    await submitTimeOffRequest(
      {
        employeeId: EMP,
        locationId: LOC,
        startDate: "2026-06-15",
        endDate: "2026-07-03", // 15 business days > the 12 seeded
      },
      h.deps,
    );

    expect(Object.values(h.ledger.getState().requests)[0]?.phase).toEqual({
      status: "denied",
      reason: "insufficient_balance",
    });
    expect(h.view().projected).toBe(12);
  });
});

describe("recovery actions", () => {
  it("retryRequest re-submits a contradicted request against the fresh version", async () => {
    const h = createHarness();
    hcm.triggerAnniversary(EMP); // forces version_conflict on first try

    await submitTimeOffRequest(
      {
        employeeId: EMP,
        locationId: LOC,
        startDate: "2026-06-15",
        endDate: "2026-06-16",
      },
      h.deps,
    );
    const clientId = Object.keys(h.ledger.getState().requests)[0] ?? "";
    expect(h.ledger.getState().requests[clientId]?.phase.status).toBe(
      "contradicted",
    );

    await retryRequest(clientId, h.deps);

    expect(h.ledger.getState().requests[clientId]?.phase.status).toBe(
      "pending_approval",
    );
    expect(h.view().confirmed?.days).toBe(11); // 12 +1 bonus −2 hold
  });

  it("discardRequest terminates a contradicted request locally", async () => {
    const h = createHarness();

    await submitTimeOffRequest(
      {
        employeeId: EMP,
        locationId: LOC,
        startDate: "2026-06-15",
        endDate: "2026-06-16",
        chaos: "silent-failure",
      },
      h.deps,
    );
    const clientId = Object.keys(h.ledger.getState().requests)[0] ?? "";

    discardRequest(clientId, h.deps);

    expect(h.ledger.getState().requests[clientId]?.phase.status).toBe(
      "discarded",
    );
    expect(h.view().projected).toBe(12);
  });
});

describe("background reconciliation vs in-flight action (TRD §6.3)", () => {
  it("a corpus refresh mid-flight cannot clobber the pending overlay", async () => {
    const h = createHarness();

    // Slow down the write so the corpus lands while the request is in flight.
    const submission = submitTimeOffRequest(
      {
        employeeId: EMP,
        locationId: LOC,
        startDate: "2026-06-15",
        endDate: "2026-06-16",
        chaos: "latency:300",
      },
      h.deps,
    );

    // While in flight: overlay holds the optimistic delta.
    await new Promise((r) => setTimeout(r, 50));
    expect(h.view().projected).toBe(10);
    expect(h.view().pending).toHaveLength(1);

    // Background reconciliation arrives with pre-write truth (12 days).
    const corpusCell = hcm.getCell(EMP, LOC);
    if (corpusCell) {
      h.queryClient.setQueryData(queryKeys.cell(EMP, LOC), corpusCell);
    }
    // The overlay survives by construction: still projecting the hold.
    expect(h.view().projected).toBe(10);

    await submission;
    expect(h.view().projected).toBe(10);
    expect(h.view().pending).toHaveLength(0);
  });
});
