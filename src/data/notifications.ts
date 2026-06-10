import { create } from "zustand";

import type { CellKey } from "@/domain/types";

/**
 * Reconciliation events surfaced to the user (TRD §6.4): mid-session balance
 * changes, contradictions, rollbacks. The data flows *push* these; the
 * ReconciliationToaster renders them. Kept out of the query cache because
 * they are facts about *transitions*, not state.
 */
export type NotificationKind =
  | "balance_changed"
  | "request_confirmed"
  | "request_contradicted"
  | "request_denied"
  | "decision_conflict";

export interface AppNotificationInput {
  readonly kind: NotificationKind;
  readonly message: string;
  readonly cellKey?: CellKey;
  readonly deltaDays?: number;
}

export interface AppNotification extends AppNotificationInput {
  readonly id: string;
  readonly at: string;
}

export type Notify = (input: AppNotificationInput) => void;

interface NotificationsState {
  readonly notifications: readonly AppNotification[];
  readonly push: Notify;
  readonly dismiss: (id: string) => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],
  push: (input) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { ...input, id: crypto.randomUUID(), at: new Date().toISOString() },
      ],
    })),
  dismiss: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
