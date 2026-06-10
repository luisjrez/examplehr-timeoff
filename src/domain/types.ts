/**
 * Domain types for the Time-Off module.
 *
 * Two-layer model (TRD §3/§4): HCM-confirmed data and the local pending
 * overlay are separate types that never write into each other. The UI only
 * ever renders a `BalanceCellView` projection of both.
 *
 * This module is pure: no React, no IO, no framework imports.
 */

/** A balance row as HCM confirmed it. Balances are per-employee, per-location. */
export interface BalanceCell {
  readonly employeeId: string;
  readonly locationId: string;
  /** Days currently available according to HCM (holds already deducted). */
  readonly days: number;
  /** Monotonic per-cell version; writes are compare-and-swap on this. */
  readonly version: number;
  /** ISO timestamp of when HCM last confirmed this value. */
  readonly updatedAt: string;
}

/** Cache/ledger key for a balance cell. */
export type CellKey = `${string}|${string}`;

export function cellKeyOf(employeeId: string, locationId: string): CellKey {
  return `${employeeId}|${locationId}`;
}

/**
 * Filing lifecycle of a time-off request as seen by the client (TRD §5).
 *
 * `accepted_unverified` is load-bearing: HCM said 2xx, but a success response
 * can still be wrong, so nothing is treated as filed until an authoritative
 * per-cell read proves the hold was applied.
 */
export type RequestPhase =
  | { readonly status: "draft" }
  | { readonly status: "submitting" }
  | { readonly status: "accepted_unverified" }
  | { readonly status: "verifying" }
  /** Filing verified against HCM; the request now awaits a manager decision. */
  | { readonly status: "pending_approval" }
  | { readonly status: "approved" }
  | { readonly status: "denied"; readonly reason: RejectionReason }
  /**
   * HCM contradicted itself: it accepted the write but the authoritative read
   * does not reflect it (silent failure / wrong effect), or the cell version
   * moved underneath the write (conflict). Recoverable by the user.
   */
  | { readonly status: "contradicted"; readonly reason: ContradictionReason }
  /** Terminal: the user discarded a contradicted request. */
  | { readonly status: "discarded" };

export type RequestStatus = RequestPhase["status"];

export type RejectionReason =
  | "insufficient_balance"
  | "invalid_dimensions"
  | "hcm_error";

export type ContradictionReason =
  | "verify_mismatch"
  | "version_conflict"
  | "hcm_silent";

/** A time-off request and its filing lifecycle. */
export interface TimeOffRequest {
  readonly id: string;
  readonly employeeId: string;
  readonly locationId: string;
  /** Whole days requested; always positive. */
  readonly days: number;
  readonly phase: RequestPhase;
  readonly createdAt: string;
}

/**
 * Events that drive the request FSM. Network responses and reconciliation
 * results are translated into these by the data layer; the reducer itself
 * never performs IO.
 */
export type RequestEvent =
  | { readonly type: "SUBMIT" }
  | { readonly type: "HCM_ACCEPTED" }
  | { readonly type: "HCM_REJECTED"; readonly reason: RejectionReason }
  | { readonly type: "HCM_CONFLICT" }
  | { readonly type: "HCM_SILENT" }
  | { readonly type: "VERIFY_START" }
  | { readonly type: "VERIFY_MATCH" }
  | { readonly type: "VERIFY_MISMATCH" }
  | { readonly type: "MANAGER_APPROVED" }
  | { readonly type: "MANAGER_DENIED" }
  | { readonly type: "RETRY" }
  | { readonly type: "DISCARD" };

/**
 * Freshness of a confirmed value, derived from its age (TRD §6.5).
 * The UI surfaces this instead of blocking when HCM is slow or silent.
 */
export type Staleness = "fresh" | "aging" | "stale";

/** What the UI renders for one cell: confirmed truth + honest overlay. */
export interface BalanceCellView {
  readonly confirmed: BalanceCell | undefined;
  /** Requests currently holding days against this cell, pre-confirmation. */
  readonly pending: readonly TimeOffRequest[];
  /** `confirmed.days` minus days held by in-flight (unverified) requests. */
  readonly projected: number;
  readonly staleness: Staleness;
}
