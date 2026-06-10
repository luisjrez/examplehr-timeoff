"use client";

import type { ReactElement } from "react";

import { useNotificationsStore } from "@/data/notifications";

import { Toast } from "./Toast";

export { TOAST_AUTO_DISMISS_MS } from "./Toast";

/**
 * Renders reconciliation events (TRD §6.4): mid-session bonuses, rollbacks,
 * contradictions. "Reconcile without surprising them" — every background
 * change the user might notice is narrated here.
 */
export function ReconciliationToaster(): ReactElement {
  const notifications = useNotificationsStore((s) => s.notifications);
  const dismiss = useNotificationsStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
    >
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );
}
