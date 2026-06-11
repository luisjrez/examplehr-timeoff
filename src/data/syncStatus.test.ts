import { describe, expect, it } from "vitest";

import { freshnessOf } from "./syncStatus";

const NOW = Date.parse("2026-06-10T12:00:00Z");
const MINUTES = 60_000;

describe("freshnessOf", () => {
  it("should be fresh while the live channel is up — sync is continuous", () => {
    // The data may not have CHANGED in hours; with SSE connected we still
    // know everything HCM knows. Old updatedAt must not read as stale.
    expect(
      freshnessOf({
        live: true,
        nowMs: NOW,
        cellSyncedAtMs: NOW - 90 * MINUTES,
        corpusSyncedAtMs: NOW - 90 * MINUTES,
      }),
    ).toBe("fresh");
  });

  it("should anchor to the most recent successful sync when polling", () => {
    // A corpus reconciliation confirms EVERY cell, even unchanged ones.
    expect(
      freshnessOf({
        live: false,
        nowMs: NOW,
        cellSyncedAtMs: NOW - 10 * MINUTES,
        corpusSyncedAtMs: NOW - 10_000,
      }),
    ).toBe("fresh");
    expect(
      freshnessOf({
        live: false,
        nowMs: NOW,
        cellSyncedAtMs: NOW - 20_000,
        corpusSyncedAtMs: NOW - 10 * MINUTES,
      }),
    ).toBe("fresh");
  });

  it("should degrade by sync age: delayed past one missed poll, out of sync past two", () => {
    expect(
      freshnessOf({
        live: false,
        nowMs: NOW,
        cellSyncedAtMs: NOW - 95_000,
        corpusSyncedAtMs: NOW - 95_000,
      }),
    ).toBe("aging");
    expect(
      freshnessOf({
        live: false,
        nowMs: NOW,
        cellSyncedAtMs: NOW - 3 * MINUTES,
        corpusSyncedAtMs: NOW - 3 * MINUTES,
      }),
    ).toBe("stale");
  });

  it("should be stale when nothing was ever synced", () => {
    expect(
      freshnessOf({
        live: false,
        nowMs: NOW,
        cellSyncedAtMs: 0,
        corpusSyncedAtMs: 0,
      }),
    ).toBe("stale");
  });
});
