/**
 * Cadences for the reconciliation loops (TRD §6.2). Centralized so the
 * trade-offs stay visible in one place: the corpus is expensive (slow poll),
 * cells are cheap (short staleTime), decisions must not go stale quietly.
 */
export const CORPUS_RECONCILE_INTERVAL_MS = 60_000;
export const CELL_STALE_TIME_MS = 15_000;
export const PENDING_REQUESTS_POLL_MS = 10_000;
export const DECISION_SYNC_POLL_MS = 5_000;
