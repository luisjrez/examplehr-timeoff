import type { RequestEvent, RequestPhase } from "./types";

/**
 * Pure FSM for the filing lifecycle of a time-off request (TRD §5).
 *
 * Design rules:
 * - Illegal (state, event) pairs return the SAME state reference: the machine
 *   ignores noise instead of throwing, so late/duplicate network events
 *   (a retried response, a stale verify) can never corrupt a request.
 * - There is no transition from `accepted_unverified` to `pending_approval`:
 *   an HCM 2xx is structurally insufficient — only a verification read
 *   (VERIFY_MATCH) can promote a filing. This encodes "a success response can
 *   still be wrong" in the type of the machine rather than in caller discipline.
 */
export function requestReducer(
  state: RequestPhase,
  event: RequestEvent,
): RequestPhase {
  switch (state.status) {
    case "draft":
      return event.type === "SUBMIT" ? { status: "submitting" } : state;

    case "submitting":
      switch (event.type) {
        case "HCM_ACCEPTED":
          return { status: "accepted_unverified" };
        case "HCM_REJECTED":
          return { status: "denied", reason: event.reason };
        case "HCM_CONFLICT":
          return { status: "contradicted", reason: "version_conflict" };
        case "HCM_SILENT":
          return { status: "contradicted", reason: "hcm_silent" };
        default:
          return state;
      }

    case "accepted_unverified":
      return event.type === "VERIFY_START" ? { status: "verifying" } : state;

    case "verifying":
      switch (event.type) {
        case "VERIFY_MATCH":
          return { status: "pending_approval" };
        case "VERIFY_MISMATCH":
          return { status: "contradicted", reason: "verify_mismatch" };
        case "HCM_SILENT":
          return { status: "contradicted", reason: "hcm_silent" };
        default:
          return state;
      }

    case "pending_approval":
      switch (event.type) {
        case "MANAGER_APPROVED":
          return { status: "approved" };
        case "MANAGER_DENIED":
          // The manager's denial is a clean outcome, not an HCM error.
          return { status: "denied", reason: "hcm_error" };
        default:
          return state;
      }

    case "contradicted":
      switch (event.type) {
        case "RETRY":
          return { status: "submitting" };
        case "DISCARD":
          return { status: "discarded" };
        default:
          return state;
      }

    // Terminal states: nothing can resurrect a settled request.
    case "approved":
    case "denied":
    case "discarded":
      return state;
  }
}

/**
 * True while the request's days are held only optimistically (the overlay
 * must subtract them). Once verified, HCM's confirmed number includes the
 * hold, so subtracting again would double-count (TRD §4 invariant).
 */
export function isPreConfirmation(phase: RequestPhase): boolean {
  switch (phase.status) {
    case "submitting":
    case "accepted_unverified":
    case "verifying":
      return true;
    default:
      return false;
  }
}
