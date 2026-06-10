"use client";

import { useCallback, useEffect, type ReactElement } from "react";

import {
  useNotificationsStore,
  type AppNotification,
  type NotificationKind,
} from "@/data/notifications";

const KIND_STYLES: Readonly<Record<NotificationKind, string>> = {
  balance_changed:
    "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  request_confirmed:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  request_contradicted:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  request_denied:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  decision_conflict:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

/** Toasts narrate transitions; they should not require manual cleanup. */
export const TOAST_AUTO_DISMISS_MS = 6_000;

interface ToastProps {
  readonly notification: AppNotification;
  readonly onDismiss: (id: string) => void;
}

function Toast({ notification, onDismiss }: ToastProps): ReactElement {
  const handleDismiss = useCallback(() => {
    onDismiss(notification.id);
  }, [onDismiss, notification.id]);

  // Each toast dismisses on its own clock; manual close stays available.
  useEffect(() => {
    const timer = setTimeout(handleDismiss, TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [handleDismiss]);

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-2 rounded-lg border p-3 text-sm shadow-sm ${KIND_STYLES[notification.kind]}`}
    >
      <p className="flex-1">{notification.message}</p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        className="text-xs opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

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
