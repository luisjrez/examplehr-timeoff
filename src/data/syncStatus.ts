import { create } from "zustand";

import type { Staleness } from "@/domain/types";

/**
 * Freshness is a property of the SYNC CHANNEL, not of the data's mutation
 * timestamp: a balance untouched for a year is perfectly fresh if we read it
 * five seconds ago, and anything is fresh while the SSE feed is connected
 * (we continuously know what HCM knows). Anchoring the badge to HCM's
 * `updatedAt` was the user-visible bug this module fixes.
 */

/** Tolerates one missed 60s corpus poll before flagging. */
const AGING_AFTER_MS = 90_000;
/** Two missed polls → the data can no longer be trusted as current. */
const STALE_AFTER_MS = 180_000;

export interface FreshnessInput {
  /** SSE channel connected → sync is continuous. */
  readonly live: boolean;
  readonly nowMs: number;
  /** Last successful authoritative read of THIS cell (0 = never). */
  readonly cellSyncedAtMs: number;
  /** Last successful corpus reconciliation — confirms every cell (0 = never). */
  readonly corpusSyncedAtMs: number;
}

export function freshnessOf(input: FreshnessInput): Staleness {
  if (input.live) {
    return "fresh";
  }
  const lastSync = Math.max(input.cellSyncedAtMs, input.corpusSyncedAtMs);
  const age = input.nowMs - lastSync;
  if (lastSync === 0 || age >= STALE_AFTER_MS) {
    return "stale";
  }
  if (age >= AGING_AFTER_MS) {
    return "aging";
  }
  return "fresh";
}

interface SyncStatusState {
  readonly live: boolean;
  readonly setLive: (live: boolean) => void;
}

/**
 * Shared SSE-channel status. Written by useRealtimeHcm (one EventSource per
 * view); read by every balance cell — they must not open their own channels.
 */
export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  live: false,
  setLive: (live) => set({ live }),
}));
