import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import type { BalanceCell } from "@/domain/types";

import { applyCorpus } from "./applyCorpus";
import { queryKeys } from "./queryKeys";
import type { AppNotificationInput } from "./notifications";

function cell(days: number, version: number): BalanceCell {
  return {
    employeeId: "emp-alice",
    locationId: "loc-mx",
    days,
    version,
    updatedAt: "2026-06-10T12:00:00Z",
  };
}

describe("applyCorpus", () => {
  it("seeds per-cell query keys so the grid never waterfalls N requests", () => {
    const queryClient = new QueryClient();

    applyCorpus(queryClient, [cell(12, 1)], () => undefined);

    expect(
      queryClient.getQueryData(queryKeys.cell("emp-alice", "loc-mx")),
    ).toEqual(cell(12, 1));
  });

  it("announces a balance change when a known cell moves (mid-session bonus)", () => {
    const queryClient = new QueryClient();
    const notifications: AppNotificationInput[] = [];
    applyCorpus(queryClient, [cell(12, 1)], (n) => notifications.push(n));

    applyCorpus(queryClient, [cell(13, 2)], (n) => notifications.push(n));

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      kind: "balance_changed",
      deltaDays: 1,
    });
    expect(
      queryClient.getQueryData(queryKeys.cell("emp-alice", "loc-mx")),
    ).toEqual(cell(13, 2));
  });

  it("stays silent on first hydration and on unchanged cells", () => {
    const queryClient = new QueryClient();
    const notifications: AppNotificationInput[] = [];

    applyCorpus(queryClient, [cell(12, 1)], (n) => notifications.push(n));
    applyCorpus(queryClient, [cell(12, 1)], (n) => notifications.push(n));

    expect(notifications).toHaveLength(0);
  });

  it("never regresses a cell to an older version (stale corpus vs fresh cell read)", () => {
    // The corpus is expensive and slow; a per-cell verification read may have
    // already written a NEWER version than the corpus snapshot carries.
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      queryKeys.cell("emp-alice", "loc-mx"),
      cell(10, 5),
    );

    applyCorpus(queryClient, [cell(12, 3)], () => undefined);

    expect(
      queryClient.getQueryData(queryKeys.cell("emp-alice", "loc-mx")),
    ).toEqual(cell(10, 5));
  });
});
