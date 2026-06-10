import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { RequestPhase, TimeOffRequest } from "@/domain/types";

import { RequestTimeline } from "./RequestTimeline";

function request(phase: RequestPhase): TimeOffRequest {
  return {
    id: "client-1",
    employeeId: "emp-alice",
    locationId: "loc-mx",
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    days: 2,
    phase,
    createdAt: "2026-06-10T12:00:00Z",
  };
}

const noop = (): void => undefined;

describe("RequestTimeline", () => {
  it("should show an in-progress label while submitting/verifying (never 'approved')", () => {
    const { rerender } = render(
      <RequestTimeline
        request={request({ status: "submitting" })}
        locationName="Mexico City"
        onRetry={noop}
        onDiscard={noop}
      />,
    );
    expect(screen.getByText(/submitting/i)).toBeInTheDocument();

    rerender(
      <RequestTimeline
        request={request({ status: "verifying" })}
        locationName="Mexico City"
        onRetry={noop}
        onDiscard={noop}
      />,
    );
    expect(screen.getByText(/verifying with hcm/i)).toBeInTheDocument();
    expect(screen.queryByText(/approved/i)).not.toBeInTheDocument();
  });

  it("should present a verified filing as awaiting approval, not as approved", () => {
    render(
      <RequestTimeline
        request={request({ status: "pending_approval" })}
        locationName="Mexico City"
        onRetry={noop}
        onDiscard={noop}
      />,
    );
    expect(screen.getByText(/awaiting manager approval/i)).toBeInTheDocument();
  });

  it("should offer retry and discard on a contradicted request (recovery UX)", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    render(
      <RequestTimeline
        request={request({ status: "contradicted", reason: "verify_mismatch" })}
        locationName="Mexico City"
        onRetry={onRetry}
        onDiscard={onDiscard}
      />,
    );

    expect(screen.getByText(/hcm did not apply/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith("client-1");
    await user.click(screen.getByRole("button", { name: /discard/i }));
    expect(onDiscard).toHaveBeenCalledWith("client-1");
  });

  it("should show denial with its reason and no recovery buttons", () => {
    render(
      <RequestTimeline
        request={request({ status: "denied", reason: "insufficient_balance" })}
        locationName="Mexico City"
        onRetry={noop}
        onDiscard={noop}
      />,
    );

    expect(screen.getByText(/denied/i)).toBeInTheDocument();
    expect(screen.getByText(/not enough days/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
