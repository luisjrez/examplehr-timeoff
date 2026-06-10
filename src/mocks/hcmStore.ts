import { businessDaysBetween } from "@/domain/dateRange";
import {
  cellKeyOf,
  type BalanceCell,
  type CellKey,
  type HcmRequestRecord,
  type HcmRequestStatus,
} from "@/domain/types";

export type { HcmRequestRecord, HcmRequestStatus };

/**
 * The brain of the mock HCM (TRD §9). Pure TypeScript, framework-free, so the
 * exact same logic backs the Next.js route handlers (app, e2e, deployed demo)
 * and the MSW handlers (Storybook, unit tests). One brain, zero drift.
 *
 * Chaos is injected per call, never rolled randomly here — randomness would
 * make the test harness untrustworthy. Demo mode rolls its dice in the HTTP
 * layer and passes the outcome down as an explicit `chaos` argument.
 */

export type ChaosMode = "silent-failure" | "wrong-success" | "conflict";

export type HcmErrorCode =
  | "version_conflict"
  | "insufficient_balance"
  | "invalid_dimensions"
  | "invalid_range"
  | "not_found"
  | "not_pending";

export type HcmResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: HcmErrorCode };

export interface FileRequestInput {
  readonly employeeId: string;
  readonly locationId: string;
  /** Inclusive ISO range; HCM derives the business-day count itself. */
  readonly startDate: string;
  readonly endDate: string;
  /** CAS guard: the cell version the client believes is current. */
  readonly expectedVersion: number;
  readonly chaos?: ChaosMode;
}

/**
 * Mutation events — they feed the real-time SSE endpoint. Cells change on
 * debits/refunds/bonuses/re-seeds; requests change on filing and decisions.
 */
export type HcmStoreEvent =
  | { readonly type: "cell"; readonly cell: BalanceCell }
  | { readonly type: "request"; readonly request: HcmRequestRecord };

export type HcmStoreListener = (event: HcmStoreEvent) => void;

export interface HcmStore {
  getCell(employeeId: string, locationId: string): BalanceCell | undefined;
  /**
   * Subscribe to store mutations. Only actual changes emit — rejected
   * writes change nothing and are silent.
   */
  subscribe(listener: HcmStoreListener): () => void;
  getCorpus(): readonly BalanceCell[];
  fileRequest(input: FileRequestInput): HcmResult<HcmRequestRecord>;
  getRequest(id: string): HcmRequestRecord | undefined;
  listRequests(status?: HcmRequestStatus): readonly HcmRequestRecord[];
  decideRequest(
    id: string,
    decision: "approve" | "deny",
    expectedCellVersion: number,
  ): HcmResult<HcmRequestRecord>;
  /** Work-anniversary bonus: +1 day on every cell of the employee. */
  triggerAnniversary(employeeId: string): readonly BalanceCell[];
  reset(): void;
}

interface SeedCell {
  readonly employeeId: string;
  readonly locationId: string;
  readonly days: number;
}

/** Deterministic seed — balances are per-employee, per-location (multiple rows). */
const SEED_CELLS: readonly SeedCell[] = [
  { employeeId: "emp-alice", locationId: "loc-mx", days: 12 },
  { employeeId: "emp-alice", locationId: "loc-us", days: 5 },
  { employeeId: "emp-bob", locationId: "loc-mx", days: 8 },
];

export const EMPLOYEE_DIRECTORY: Readonly<Record<string, string>> = {
  "emp-alice": "Alice Hernández",
  "emp-bob": "Bob Castillo",
};

export const LOCATION_DIRECTORY: Readonly<Record<string, string>> = {
  "loc-mx": "Mexico City",
  "loc-us": "Austin, TX",
};

export function createHcmStore(now: () => Date = () => new Date()): HcmStore {
  let cells = new Map<CellKey, BalanceCell>();
  let requests = new Map<string, HcmRequestRecord>();
  let requestSequence = 0;
  const listeners = new Set<HcmStoreListener>();

  function emit(event: HcmStoreEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // One broken SSE connection must never poison the others.
      }
    }
  }

  function seed(): void {
    cells = new Map(
      SEED_CELLS.map((cell) => [
        cellKeyOf(cell.employeeId, cell.locationId),
        {
          ...cell,
          version: 1,
          updatedAt: now().toISOString(),
        },
      ]),
    );
    requests = new Map();
    requestSequence = 0;
    // Live clients must converge on the fresh seed (e2e resets mid-session).
    for (const cell of cells.values()) {
      emit({ type: "cell", cell });
    }
  }

  function mutateCell(cell: BalanceCell, daysDelta: number): BalanceCell {
    const next: BalanceCell = {
      ...cell,
      days: cell.days + daysDelta,
      version: cell.version + 1,
      updatedAt: now().toISOString(),
    };
    cells.set(cellKeyOf(cell.employeeId, cell.locationId), next);
    emit({ type: "cell", cell: next });
    return next;
  }

  function buildRequest(
    input: FileRequestInput,
    days: number,
  ): HcmRequestRecord {
    requestSequence += 1;
    return {
      id: `req-${String(requestSequence).padStart(4, "0")}`,
      employeeId: input.employeeId,
      locationId: input.locationId,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      status: "pending",
      filedAt: now().toISOString(),
    };
  }

  seed();

  return {
    getCell(employeeId, locationId) {
      return cells.get(cellKeyOf(employeeId, locationId));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getCorpus() {
      return [...cells.values()];
    },

    fileRequest(input) {
      const cell = cells.get(cellKeyOf(input.employeeId, input.locationId));
      if (!cell) {
        return { ok: false, error: "invalid_dimensions" };
      }
      if (
        input.chaos === "conflict" ||
        cell.version !== input.expectedVersion
      ) {
        return { ok: false, error: "version_conflict" };
      }
      // HCM derives the hold size itself: a client cannot file a hold that
      // disagrees with its own range (TRD §13 — no trust in the wire shape).
      const days = businessDaysBetween(input.startDate, input.endDate);
      if (days === 0) {
        return { ok: false, error: "invalid_range" };
      }
      if (cell.days < days) {
        return { ok: false, error: "insufficient_balance" };
      }

      const record = buildRequest(input, days);

      // silent-failure: the response will say "created" but HCM kept nothing.
      if (input.chaos === "silent-failure") {
        return { ok: true, value: record };
      }
      // wrong-success: the request exists but the hold was never applied —
      // the per-cell verification read is the only thing that can catch this.
      if (input.chaos === "wrong-success") {
        requests.set(record.id, record);
        emit({ type: "request", request: record });
        return { ok: true, value: record };
      }

      requests.set(record.id, record);
      emit({ type: "request", request: record });
      mutateCell(cell, -days);
      return { ok: true, value: record };
    },

    getRequest(id) {
      return requests.get(id);
    },

    listRequests(status) {
      const all = [...requests.values()];
      return status ? all.filter((r) => r.status === status) : all;
    },

    decideRequest(id, decision, expectedCellVersion) {
      const request = requests.get(id);
      if (!request) {
        return { ok: false, error: "not_found" };
      }
      if (request.status !== "pending") {
        return { ok: false, error: "not_pending" };
      }
      const cell = cells.get(cellKeyOf(request.employeeId, request.locationId));
      if (!cell) {
        return { ok: false, error: "invalid_dimensions" };
      }
      // Decision integrity (TRD §7): a manager may only decide against the
      // exact balance they were shown. If HCM moved on, they must re-read.
      if (cell.version !== expectedCellVersion) {
        return { ok: false, error: "version_conflict" };
      }

      const decided: HcmRequestRecord = {
        ...request,
        status: decision === "approve" ? "approved" : "denied",
        decidedAt: now().toISOString(),
      };
      requests.set(id, decided);
      emit({ type: "request", request: decided });

      // Approve keeps the hold (already debited at filing); deny refunds it.
      if (decision === "deny") {
        mutateCell(cell, request.days);
      }
      return { ok: true, value: decided };
    },

    triggerAnniversary(employeeId) {
      const affected: BalanceCell[] = [];
      for (const cell of cells.values()) {
        if (cell.employeeId === employeeId) {
          affected.push(mutateCell(cell, 1));
        }
      }
      return affected;
    },

    reset() {
      seed();
    },
  };
}
