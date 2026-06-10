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

import { decideOnRequest } from "./decideFlow";
import { queryKeys } from "./queryKeys";
import type { AppNotificationInput } from "./notifications";

const EMP = "emp-alice";
const LOC = "loc-mx";

const hcm: HcmStore = createHcmStore();
const server = setupServer(...buildHcmHandlers(hcm));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const END_BY_DAYS: Readonly<Record<number, string>> = {
  2: "2026-06-16",
  3: "2026-06-17",
};

function filePendingRequest(days: number): string {
  const version = hcm.getCell(EMP, LOC)?.version ?? -1;
  const filed = hcm.fileRequest({
    employeeId: EMP,
    locationId: LOC,
    startDate: "2026-06-15",
    endDate: END_BY_DAYS[days] ?? "2026-06-16",
    expectedVersion: version,
  });
  if (!filed.ok) {
    throw new Error("seed filing failed");
  }
  return filed.value.id;
}

describe("decideOnRequest", () => {
  let queryClient: QueryClient;
  let notifications: AppNotificationInput[];

  beforeEach(() => {
    hcm.reset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    notifications = [];
  });

  it("approves against the exact version the manager saw", async () => {
    const id = filePendingRequest(3);
    const version = hcm.getCell(EMP, LOC)?.version ?? -1;

    const result = await decideOnRequest(
      { id, decision: "approve", expectedCellVersion: version },
      { queryClient, notify: (n) => notifications.push(n) },
    );

    expect(result.kind).toBe("decided");
    expect(hcm.getRequest(id)?.status).toBe("approved");
  });

  it("blocks the decision when the balance moved since the manager looked", async () => {
    const id = filePendingRequest(3);
    const staleVersion = hcm.getCell(EMP, LOC)?.version ?? -1;
    hcm.triggerAnniversary(EMP); // version moves underneath the open panel

    const result = await decideOnRequest(
      { id, decision: "approve", expectedCellVersion: staleVersion },
      { queryClient, notify: (n) => notifications.push(n) },
    );

    expect(result.kind).toBe("version_conflict");
    expect(hcm.getRequest(id)?.status).toBe("pending");
    // The fresh cell is placed in the cache so the panel re-arms with truth.
    expect(queryClient.getQueryData(queryKeys.cell(EMP, LOC))).toMatchObject({
      version: staleVersion + 1,
    });
    expect(notifications.some((n) => n.kind === "decision_conflict")).toBe(
      true,
    );
  });

  it("denying refunds the hold and refreshes the cell cache", async () => {
    const id = filePendingRequest(3);
    const version = hcm.getCell(EMP, LOC)?.version ?? -1;

    const result = await decideOnRequest(
      { id, decision: "deny", expectedCellVersion: version },
      { queryClient, notify: (n) => notifications.push(n) },
    );

    expect(result.kind).toBe("decided");
    expect(queryClient.getQueryData(queryKeys.cell(EMP, LOC))).toMatchObject({
      days: 12,
    });
  });
});
