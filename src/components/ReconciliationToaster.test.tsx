import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { useNotificationsStore } from "@/data/notifications";

import {
  ReconciliationToaster,
  TOAST_AUTO_DISMISS_MS,
} from "./ReconciliationToaster";

describe("ReconciliationToaster", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotificationsStore.getState().clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    useNotificationsStore.getState().clear();
  });

  it("should auto-dismiss a toast after the timeout", () => {
    render(<ReconciliationToaster />);

    act(() => {
      useNotificationsStore.getState().push({
        kind: "balance_changed",
        message: "Balance updated by HCM: +1 day(s) at loc-mx",
      });
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS + 50);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should dismiss each toast on its own clock, not in batches", () => {
    render(<ReconciliationToaster />);

    act(() => {
      useNotificationsStore.getState().push({
        kind: "balance_changed",
        message: "first",
      });
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS / 2);
    });
    act(() => {
      useNotificationsStore.getState().push({
        kind: "request_confirmed",
        message: "second",
      });
    });

    // First expires; second is only halfway through its lifetime.
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS / 2 + 50);
    });
    expect(screen.queryByText("first")).not.toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });
});
