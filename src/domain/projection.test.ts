import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  projectCell,
  stalenessOf,
  STALENESS_THRESHOLDS_MS,
} from "./projection";
import type { BalanceCell, RequestPhase, TimeOffRequest } from "./types";

const NOW = new Date("2026-06-10T12:00:00Z");

function cell(days: number, updatedAt = NOW.toISOString()): BalanceCell {
  return {
    employeeId: "emp-1",
    locationId: "loc-mx",
    days,
    version: 3,
    updatedAt,
  };
}

function request(days: number, phase: RequestPhase): TimeOffRequest {
  return {
    id: `req-${days}-${phase.status}`,
    employeeId: "emp-1",
    locationId: "loc-mx",
    days,
    phase,
    createdAt: NOW.toISOString(),
  };
}

describe("projectCell", () => {
  it("with no pending requests, projected equals confirmed", () => {
    const view = projectCell(cell(10), [], NOW);
    expect(view.projected).toBe(10);
    expect(view.pending).toEqual([]);
  });

  it("subtracts only pre-confirmation requests (the optimistic overlay)", () => {
    const view = projectCell(
      cell(10),
      [
        request(2, { status: "submitting" }),
        request(1, { status: "accepted_unverified" }),
        request(3, { status: "verifying" }),
      ],
      NOW,
    );
    expect(view.projected).toBe(4);
    expect(view.pending).toHaveLength(3);
  });

  it("does NOT subtract verified filings — HCM's confirmed number already holds them", () => {
    // Double-counting here is the classic optimistic-update bug this model kills.
    const view = projectCell(
      cell(8),
      [request(2, { status: "pending_approval" })],
      NOW,
    );
    expect(view.projected).toBe(8);
    expect(view.pending).toEqual([]);
  });

  it("drops contradicted/denied/discarded requests from the overlay (rollback)", () => {
    const view = projectCell(
      cell(10),
      [
        request(2, { status: "contradicted", reason: "verify_mismatch" }),
        request(1, { status: "denied", reason: "insufficient_balance" }),
        request(4, { status: "discarded" }),
      ],
      NOW,
    );
    expect(view.projected).toBe(10);
  });

  it("handles a missing confirmed cell (never hydrated) without lying", () => {
    const view = projectCell(
      undefined,
      [request(2, { status: "submitting" })],
      NOW,
    );
    expect(view.confirmed).toBeUndefined();
    expect(view.projected).toBe(-2);
    expect(view.staleness).toBe("stale");
  });

  it("invariant: projected === confirmed − Σ(pre-confirmation days), for any mix", () => {
    const arbitraryPhase: fc.Arbitrary<RequestPhase> = fc.constantFrom(
      { status: "draft" },
      { status: "submitting" },
      { status: "accepted_unverified" },
      { status: "verifying" },
      { status: "pending_approval" },
      { status: "approved" },
      { status: "denied", reason: "insufficient_balance" },
      { status: "contradicted", reason: "verify_mismatch" },
      { status: "discarded" },
    );
    const arbitraryRequest = fc
      .tuple(fc.integer({ min: 1, max: 30 }), arbitraryPhase)
      .map(([days, phase]) => request(days, phase));

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 }),
        fc.array(arbitraryRequest, { maxLength: 12 }),
        (confirmedDays, requests) => {
          const view = projectCell(cell(confirmedDays), requests, NOW);
          const held = requests
            .filter((r) =>
              ["submitting", "accepted_unverified", "verifying"].includes(
                r.phase.status,
              ),
            )
            .reduce((sum, r) => sum + r.days, 0);
          expect(view.projected).toBe(confirmedDays - held);
        },
      ),
    );
  });
});

describe("stalenessOf", () => {
  it("classifies by age of the confirmed timestamp", () => {
    const at = (msAgo: number): string =>
      new Date(NOW.getTime() - msAgo).toISOString();
    expect(stalenessOf(at(0), NOW)).toBe("fresh");
    expect(stalenessOf(at(STALENESS_THRESHOLDS_MS.aging - 1), NOW)).toBe(
      "fresh",
    );
    expect(stalenessOf(at(STALENESS_THRESHOLDS_MS.aging), NOW)).toBe("aging");
    expect(stalenessOf(at(STALENESS_THRESHOLDS_MS.stale - 1), NOW)).toBe(
      "aging",
    );
    expect(stalenessOf(at(STALENESS_THRESHOLDS_MS.stale), NOW)).toBe("stale");
  });
});
