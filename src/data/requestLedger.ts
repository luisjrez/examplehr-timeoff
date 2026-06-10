import { createStore, type StateCreator, type StoreApi } from "zustand/vanilla";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";

import { requestReducer } from "@/domain/requestMachine";
import type { RequestEvent, TimeOffRequest } from "@/domain/types";

/**
 * The pending overlay (TRD §3.1-C): every time-off request this session
 * created, keyed by a client-generated id, each carrying its FSM phase.
 *
 * This store NEVER holds balance numbers. Balances live in the query cache
 * (confirmed layer); the projection composes the two. That write-isolation is
 * what makes the background-refresh-vs-in-flight-action race unrepresentable.
 */
export interface LedgerRequest extends TimeOffRequest {
  /** HCM's id for the filing, once it returned one. */
  readonly hcmId?: string;
}

export interface LedgerState {
  readonly requests: Readonly<Record<string, LedgerRequest>>;
  readonly upsert: (request: LedgerRequest) => void;
  /** Routes an event through the pure FSM; illegal events are no-ops. */
  readonly dispatch: (clientId: string, event: RequestEvent) => void;
  readonly attachHcmId: (clientId: string, hcmId: string) => void;
  /** Wipe session state — used by Storybook/tests for isolation. */
  readonly clear: () => void;
}

export type LedgerStore = StoreApi<LedgerState>;

const ledgerState: StateCreator<LedgerState> = (set) => ({
  requests: {},

  upsert: (request) =>
    set((state) => ({
      requests: { ...state.requests, [request.id]: request },
    })),

  dispatch: (clientId, event) =>
    set((state) => {
      const existing = state.requests[clientId];
      if (!existing) {
        return state;
      }
      const phase = requestReducer(existing.phase, event);
      if (phase === existing.phase) {
        return state;
      }
      return {
        requests: { ...state.requests, [clientId]: { ...existing, phase } },
      };
    }),

  attachHcmId: (clientId, hcmId) =>
    set((state) => {
      const existing = state.requests[clientId];
      return existing
        ? {
            requests: {
              ...state.requests,
              [clientId]: { ...existing, hcmId },
            },
          }
        : state;
    }),

  clear: () => set({ requests: {} }),
});

/** Plain in-memory ledger — what tests and Storybook scenarios use. */
export function createLedgerStore(): LedgerStore {
  return createStore<LedgerState>(ledgerState);
}

// SSR-safe storage: "use client" modules still evaluate on the server for
// the first render; there, persistence is a no-op.
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

/**
 * App-wide singleton, persisted to localStorage (plan-0001 phase-2): a
 * reload must not vanish the user's in-flight requests while HCM still
 * holds their days. Rehydrated entries are NOT trusted as-is —
 * `reconcileRehydratedLedger` re-verifies them on boot so a stale overlay
 * can never double-count against the confirmed balance.
 */
export const appLedger: LedgerStore = createStore<LedgerState>()(
  persist(ledgerState, {
    name: "examplehr-timeoff-ledger",
    storage: createJSONStorage(() =>
      typeof window === "undefined" ? noopStorage : window.localStorage,
    ),
    partialize: (state) => ({ requests: state.requests }),
  }),
);
