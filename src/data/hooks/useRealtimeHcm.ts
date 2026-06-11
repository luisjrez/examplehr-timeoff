"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useNotificationsStore } from "../notifications";
import { appLedger } from "../requestLedger";
import { reconcileRealtimeEvent } from "../realtime";
import { useSyncStatusStore } from "../syncStatus";

/**
 * Subscribes to the HCM real-time feed (SSE) and folds events into the
 * confirmed layer (TRD §6.6). Returns whether the live channel is up so the
 * UI can disclose its data-freshness mode — when it is down, the corpus
 * poll is still reconciling, just slower.
 */
export function useRealtimeHcm(): { readonly live: boolean } {
  const queryClient = useQueryClient();
  const notify = useNotificationsStore((s) => s.push);
  const [live, setLive] = useState(false);
  // Mirror into the shared store: balance cells read channel health from
  // there (they must never open their own EventSource).
  const setSharedLive = useSyncStatusStore((s) => s.setLive);

  useEffect(() => {
    // jsdom (unit tests) has no EventSource; Storybook's MSW answers 204,
    // which closes the channel permanently — both fall back to polling.
    if (typeof EventSource === "undefined") {
      return undefined;
    }
    const source = new EventSource("/api/hcm/events");

    const handleOpen = (): void => {
      setLive(true);
      setSharedLive(true);
    };
    const handleError = (): void => {
      setLive(false);
      setSharedLive(false);
    };
    const handleMessage = (event: MessageEvent<string>): void => {
      reconcileRealtimeEvent(queryClient, appLedger, event.data, notify);
    };

    source.addEventListener("open", handleOpen);
    source.addEventListener("error", handleError);
    source.addEventListener("message", handleMessage);

    return () => {
      source.close();
      setSharedLive(false);
    };
  }, [queryClient, notify, setSharedLive]);

  return { live };
}
