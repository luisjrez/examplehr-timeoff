import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHcmStore, type HcmStore, type HcmStoreEvent } from "./hcmStore";

const EMP = "emp-alice";
const LOC = "loc-mx";

describe("hcmStore — change events (realtime feed)", () => {
  let store: HcmStore;
  let events: HcmStoreEvent[];
  let unsubscribe: () => void;

  beforeEach(() => {
    store = createHcmStore();
    events = [];
    unsubscribe = store.subscribe((event) => events.push(event));
  });

  function cellEvents(): readonly HcmStoreEvent[] {
    return events.filter((e) => e.type === "cell");
  }
  function requestEvents(): readonly HcmStoreEvent[] {
    return events.filter((e) => e.type === "request");
  }

  it("should emit the request AND the debited cell when a filing succeeds", () => {
    const version = store.getCell(EMP, LOC)?.version ?? -1;

    store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: version,
    });

    expect(requestEvents()).toHaveLength(1);
    expect(requestEvents()[0]).toMatchObject({
      type: "request",
      request: { employeeId: EMP, status: "pending" },
    });
    expect(cellEvents()).toHaveLength(1);
    expect(cellEvents()[0]).toMatchObject({
      type: "cell",
      cell: { employeeId: EMP, locationId: LOC, days: 10 },
    });
  });

  it("should emit the decided request plus the refunded cell on denial", () => {
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

    expect(requestEvents()).toHaveLength(1);
    expect(requestEvents()[0]).toMatchObject({
      type: "request",
      request: { id: filed.value.id, status: "denied" },
    });
    expect(cellEvents()).toHaveLength(1);
    expect(cellEvents()[0]).toMatchObject({ type: "cell", cell: { days: 12 } });
  });

  it("should emit one cell event per anniversary cell", () => {
    store.triggerAnniversary(EMP);

    expect(requestEvents()).toHaveLength(0);
    expect(
      cellEvents()
        .map((e) => (e.type === "cell" ? e.cell.locationId : ""))
        .sort(),
    ).toEqual(["loc-mx", "loc-us"]);
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

  it("silent-failure emits nothing; wrong-success emits the request but no cell", () => {
    const version = store.getCell(EMP, LOC)?.version ?? -1;

    store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: version,
      chaos: "silent-failure",
    });
    expect(events).toHaveLength(0);

    store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: version,
      chaos: "wrong-success",
    });
    expect(requestEvents()).toHaveLength(1);
    expect(cellEvents()).toHaveLength(0);
  });

  it("should emit every re-seeded cell on reset so live clients refresh", () => {
    store.reset();
    expect(cellEvents()).toHaveLength(3);
    expect(
      cellEvents().every((e) => e.type === "cell" && e.cell.version === 1),
    ).toBe(true);
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
