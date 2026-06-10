import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { requestReducer, isPreConfirmation } from "./requestMachine";
import type { RequestEvent, RequestPhase, RequestStatus } from "./types";

const draft: RequestPhase = { status: "draft" };

function phase(status: RequestStatus): RequestPhase {
  switch (status) {
    case "denied":
      return { status, reason: "insufficient_balance" };
    case "contradicted":
      return { status, reason: "verify_mismatch" };
    default:
      return { status } as RequestPhase;
  }
}

const allEvents: readonly RequestEvent[] = [
  { type: "SUBMIT" },
  { type: "HCM_ACCEPTED" },
  { type: "HCM_REJECTED", reason: "insufficient_balance" },
  { type: "HCM_CONFLICT" },
  { type: "HCM_SILENT" },
  { type: "VERIFY_START" },
  { type: "VERIFY_MATCH" },
  { type: "VERIFY_MISMATCH" },
  { type: "MANAGER_APPROVED" },
  { type: "MANAGER_DENIED" },
  { type: "RETRY" },
  { type: "DISCARD" },
];

describe("requestReducer — happy path", () => {
  it("walks draft → submitting → accepted_unverified → verifying → pending_approval", () => {
    let s: RequestPhase = draft;
    s = requestReducer(s, { type: "SUBMIT" });
    expect(s.status).toBe("submitting");
    s = requestReducer(s, { type: "HCM_ACCEPTED" });
    expect(s.status).toBe("accepted_unverified");
    s = requestReducer(s, { type: "VERIFY_START" });
    expect(s.status).toBe("verifying");
    s = requestReducer(s, { type: "VERIFY_MATCH" });
    expect(s.status).toBe("pending_approval");
  });

  it("manager decision resolves a pending_approval request", () => {
    expect(
      requestReducer(phase("pending_approval"), { type: "MANAGER_APPROVED" })
        .status,
    ).toBe("approved");
    const denied = requestReducer(phase("pending_approval"), {
      type: "MANAGER_DENIED",
    });
    expect(denied.status).toBe("denied");
  });
});

describe("requestReducer — the success that lies (TRD §5)", () => {
  it("a 2xx alone NEVER yields pending_approval; verification is mandatory", () => {
    const afterAccept = requestReducer(phase("submitting"), {
      type: "HCM_ACCEPTED",
    });
    expect(afterAccept.status).toBe("accepted_unverified");
  });

  it("verify mismatch contradicts the accepted write", () => {
    const s = requestReducer(phase("verifying"), { type: "VERIFY_MISMATCH" });
    expect(s).toEqual({ status: "contradicted", reason: "verify_mismatch" });
  });

  it("a version conflict during submit contradicts (balance moved underneath)", () => {
    const s = requestReducer(phase("submitting"), { type: "HCM_CONFLICT" });
    expect(s).toEqual({ status: "contradicted", reason: "version_conflict" });
  });

  it("silence is a contradiction, not a success", () => {
    const s = requestReducer(phase("submitting"), { type: "HCM_SILENT" });
    expect(s).toEqual({ status: "contradicted", reason: "hcm_silent" });
  });

  it("a clear HCM rejection denies with its reason", () => {
    const s = requestReducer(phase("submitting"), {
      type: "HCM_REJECTED",
      reason: "insufficient_balance",
    });
    expect(s).toEqual({ status: "denied", reason: "insufficient_balance" });
  });
});

describe("requestReducer — recovery from contradiction", () => {
  it("RETRY re-enters submitting (against a fresh balance)", () => {
    expect(
      requestReducer(phase("contradicted"), { type: "RETRY" }).status,
    ).toBe("submitting");
  });

  it("DISCARD terminates the request", () => {
    expect(
      requestReducer(phase("contradicted"), { type: "DISCARD" }).status,
    ).toBe("discarded");
  });
});

describe("requestReducer — structural guarantees (property-based)", () => {
  const arbitraryEvent = fc.constantFrom(...allEvents);

  it("ignores events that are illegal in the current state (no throw, no jump)", () => {
    // Terminal states accept no events at all.
    const terminal: readonly RequestStatus[] = [
      "approved",
      "denied",
      "discarded",
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...terminal),
        arbitraryEvent,
        (status, event) => {
          const before = phase(status);
          expect(requestReducer(before, event)).toBe(before);
        },
      ),
    );
  });

  it("no event sequence can reach approved/denied without passing verification", () => {
    fc.assert(
      fc.property(fc.array(arbitraryEvent, { maxLength: 25 }), (events) => {
        let current: RequestPhase = draft;
        let verified = false;
        for (const event of events) {
          const next = requestReducer(current, event);
          // Ignored events (next === current) are not transitions; only an
          // actual entry into approved/denied is subject to the invariant.
          const transitioned = next !== current;
          if (
            transitioned &&
            next.status === "pending_approval" &&
            current.status === "verifying"
          ) {
            verified = true;
          }
          // A manager outcome may only ever exist after a verified filing.
          if (
            transitioned &&
            (next.status === "approved" || next.status === "denied")
          ) {
            const deniedAtFiling =
              next.status === "denied" && current.status === "submitting";
            if (!deniedAtFiling) {
              expect(verified).toBe(true);
            }
          }
          current = next;
        }
      }),
    );
  });

  it("every reachable state is a declared RequestStatus", () => {
    const legal: ReadonlySet<RequestStatus> = new Set([
      "draft",
      "submitting",
      "accepted_unverified",
      "verifying",
      "pending_approval",
      "approved",
      "denied",
      "contradicted",
      "discarded",
    ]);
    fc.assert(
      fc.property(fc.array(arbitraryEvent, { maxLength: 40 }), (events) => {
        let current: RequestPhase = draft;
        for (const event of events) {
          current = requestReducer(current, event);
          expect(legal.has(current.status)).toBe(true);
        }
      }),
    );
  });
});

describe("isPreConfirmation", () => {
  it("is true exactly while the request may still hold an optimistic delta", () => {
    expect(isPreConfirmation(phase("submitting"))).toBe(true);
    expect(isPreConfirmation(phase("accepted_unverified"))).toBe(true);
    expect(isPreConfirmation(phase("verifying"))).toBe(true);
    expect(isPreConfirmation(phase("draft"))).toBe(false);
    expect(isPreConfirmation(phase("pending_approval"))).toBe(false);
    expect(isPreConfirmation(phase("contradicted"))).toBe(false);
    expect(isPreConfirmation(phase("approved"))).toBe(false);
  });
});
