import { beforeEach, describe, expect, it } from "vitest";

import { createHcmStore, type HcmStore } from "./hcmStore";

const EMP = "emp-alice";
const LOC = "loc-mx";

function freshStore(): HcmStore {
  // Deterministic seed: emp-alice has 12 days at loc-mx and 5 at loc-us;
  // emp-bob has 8 at loc-mx. See SEED_CELLS in hcmStore.ts.
  return createHcmStore();
}

describe("hcmStore — authoritative reads", () => {
  let store: HcmStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("reads a seeded cell with version and timestamp", () => {
    const cell = store.getCell(EMP, LOC);
    expect(cell?.days).toBe(12);
    expect(cell?.version).toBe(1);
    expect(cell?.updatedAt).toEqual(expect.any(String));
  });

  it("returns undefined for unknown dimension combinations", () => {
    expect(store.getCell("emp-ghost", LOC)).toBeUndefined();
    expect(store.getCell(EMP, "loc-ghost")).toBeUndefined();
  });

  it("corpus returns every cell across all dimensions", () => {
    const corpus = store.getCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(3);
    expect(corpus.every((c) => typeof c.version === "number")).toBe(true);
  });
});

describe("hcmStore — filing a request (hold semantics + CAS)", () => {
  let store: HcmStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("debits the hold and bumps the cell version on success", () => {
    const before = store.getCell(EMP, LOC);
    const result = store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: before?.version ?? -1,
    });

    expect(result.ok).toBe(true);
    const after = store.getCell(EMP, LOC);
    expect(after?.days).toBe(10);
    expect(after?.version).toBe((before?.version ?? 0) + 1);
    if (result.ok) {
      expect(store.getRequest(result.value.id)?.status).toBe("pending");
    }
  });

  it("rejects with version_conflict when expectedVersion is stale (CAS)", () => {
    const result = store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: 999,
    });
    expect(result).toEqual({ ok: false, error: "version_conflict" });
    expect(store.getCell(EMP, LOC)?.days).toBe(12);
  });

  it("rejects with insufficient_balance and mutates nothing", () => {
    const version = store.getCell(EMP, LOC)?.version ?? -1;
    const result = store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 13,
      expectedVersion: version,
    });
    expect(result).toEqual({ ok: false, error: "insufficient_balance" });
    expect(store.getCell(EMP, LOC)?.version).toBe(version);
  });

  it("rejects invalid dimension combinations", () => {
    const result = store.fileRequest({
      employeeId: EMP,
      locationId: "loc-ghost",
      days: 1,
      expectedVersion: 1,
    });
    expect(result).toEqual({ ok: false, error: "invalid_dimensions" });
  });
});

describe("hcmStore — chaos modes (deterministic injection)", () => {
  let store: HcmStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("silent-failure: reports success but nothing was filed nor debited", () => {
    const version = store.getCell(EMP, LOC)?.version ?? -1;
    const result = store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: version,
      chaos: "silent-failure",
    });

    expect(result.ok).toBe(true);
    expect(store.getCell(EMP, LOC)?.days).toBe(12);
    expect(store.getCell(EMP, LOC)?.version).toBe(version);
    if (result.ok) {
      // The lie is complete: the returned id does not exist in HCM.
      expect(store.getRequest(result.value.id)).toBeUndefined();
    }
  });

  it("wrong-success: stores the request but never applies the hold", () => {
    const version = store.getCell(EMP, LOC)?.version ?? -1;
    const result = store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: version,
      chaos: "wrong-success",
    });

    expect(result.ok).toBe(true);
    expect(store.getCell(EMP, LOC)?.days).toBe(12);
    if (result.ok) {
      expect(store.getRequest(result.value.id)?.status).toBe("pending");
    }
  });

  it("conflict: forces a version_conflict regardless of the version sent", () => {
    const version = store.getCell(EMP, LOC)?.version ?? -1;
    const result = store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 2,
      expectedVersion: version,
      chaos: "conflict",
    });
    expect(result).toEqual({ ok: false, error: "version_conflict" });
  });
});

describe("hcmStore — manager decisions", () => {
  let store: HcmStore;
  let requestId: string;

  beforeEach(() => {
    store = freshStore();
    const version = store.getCell(EMP, LOC)?.version ?? -1;
    const filed = store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 3,
      expectedVersion: version,
    });
    if (!filed.ok) {
      throw new Error("seed filing failed");
    }
    requestId = filed.value.id;
  });

  it("approve keeps the hold and gates on the cell version (CAS)", () => {
    const cellVersion = store.getCell(EMP, LOC)?.version ?? -1;
    const result = store.decideRequest(requestId, "approve", cellVersion);

    expect(result.ok).toBe(true);
    expect(store.getRequest(requestId)?.status).toBe("approved");
    expect(store.getCell(EMP, LOC)?.days).toBe(9);
  });

  it("approve with a stale cell version conflicts — decision integrity", () => {
    // The balance moved (anniversary) after the manager loaded their panel.
    store.triggerAnniversary(EMP);
    const result = store.decideRequest(requestId, "approve", 2);

    expect(result).toEqual({ ok: false, error: "version_conflict" });
    expect(store.getRequest(requestId)?.status).toBe("pending");
  });

  it("deny refunds the hold and bumps the version", () => {
    const beforeVersion = store.getCell(EMP, LOC)?.version ?? -1;
    const result = store.decideRequest(requestId, "deny", beforeVersion);

    expect(result.ok).toBe(true);
    expect(store.getRequest(requestId)?.status).toBe("denied");
    expect(store.getCell(EMP, LOC)?.days).toBe(12);
    expect(store.getCell(EMP, LOC)?.version).toBe(beforeVersion + 1);
  });

  it("deciding a settled request fails with not_pending", () => {
    const cellVersion = store.getCell(EMP, LOC)?.version ?? -1;
    store.decideRequest(requestId, "approve", cellVersion);
    const again = store.decideRequest(requestId, "deny", cellVersion);
    expect(again).toEqual({ ok: false, error: "not_pending" });
  });
});

describe("hcmStore — the world changes underneath (anniversary bonus)", () => {
  let store: HcmStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("grants +1 day to every cell of the employee and bumps versions", () => {
    const mxBefore = store.getCell(EMP, LOC);
    const usBefore = store.getCell(EMP, "loc-us");

    const affected = store.triggerAnniversary(EMP);

    expect(affected.map((c) => c.locationId).sort()).toEqual([
      "loc-mx",
      "loc-us",
    ]);
    expect(store.getCell(EMP, LOC)?.days).toBe((mxBefore?.days ?? 0) + 1);
    expect(store.getCell(EMP, LOC)?.version).toBe((mxBefore?.version ?? 0) + 1);
    expect(store.getCell(EMP, "loc-us")?.days).toBe((usBefore?.days ?? 0) + 1);
  });

  it("invalidates in-flight CAS writes (this is the race the UI must survive)", () => {
    const staleVersion = store.getCell(EMP, LOC)?.version ?? -1;
    store.triggerAnniversary(EMP);

    const result = store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 1,
      expectedVersion: staleVersion,
    });
    expect(result).toEqual({ ok: false, error: "version_conflict" });
  });
});

describe("hcmStore — reset", () => {
  it("returns the store to the deterministic seed", () => {
    const store = freshStore();
    const version = store.getCell(EMP, LOC)?.version ?? -1;
    store.fileRequest({
      employeeId: EMP,
      locationId: LOC,
      days: 5,
      expectedVersion: version,
    });

    store.reset();

    expect(store.getCell(EMP, LOC)?.days).toBe(12);
    expect(store.getCell(EMP, LOC)?.version).toBe(1);
    expect(store.listRequests()).toEqual([]);
  });
});
