import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BalanceCell } from "@/domain/types";

import { createHcmStore, type HcmStore } from "./hcmStore";

const EMP = "emp-alice";
const LOC = "loc-mx";

describe("hcmStore — change events (realtime feed)", () => {
  let store: HcmStore;
  let events: BalanceCell[];
  let unsubscribe: () => void;

  beforeEach(() => {
    store = createHcmStore();
    events = [];
    unsubscribe = store.subscribe((cell) => events.push(cell));
  });

  it("should emit the mutated cell when a filing debits its hold", () => {
    const version = store.getCell(EMP, LOC)?.version ?? -1;

    store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: version,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      employeeId: EMP,
      locationId: LOC,
      days: 10,
    });
  });

  it("should emit on denial refunds and on every anniversary cell", () => {
    const version = store.getCell(EMP, LOC)?.version ?? -1;
    const filed = store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: version,
    });
    if (!filed.ok) {
      throw new Error("seed filing failed");
    }
    events.length = 0;

    store.decideRequest(filed.value.id, "deny", version + 1);
    expect(events).toHaveLength(1);
    expect(events[0]?.days).toBe(12);

    events.length = 0;
    store.triggerAnniversary(EMP);
    expect(events.map((c) => c.locationId).sort()).toEqual([
      "loc-mx",
      "loc-us",
    ]);
  });

  it("should NOT emit on rejected writes (nothing changed at HCM)", () => {
    store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: 999, // stale → version_conflict
    });
    store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 99, // insufficient
      expectedVersion: store.getCell(EMP, LOC)?.version ?? -1,
    });

    expect(events).toHaveLength(0);
  });

  it("should emit every re-seeded cell on reset so live clients refresh", () => {
    store.reset();
    expect(events).toHaveLength(3);
    expect(events.every((c) => c.version === 1)).toBe(true);
  });

  it("should stop emitting after unsubscribe", () => {
    unsubscribe();
    store.triggerAnniversary(EMP);
    expect(events).toHaveLength(0);
  });

  it("should keep other listeners alive when one throws", () => {
    const healthy = vi.fn();
    store.subscribe(() => {
      throw new Error("bad listener");
    });
    store.subscribe(healthy);

    store.triggerAnniversary(EMP);

    expect(healthy).toHaveBeenCalled();
  });
});
