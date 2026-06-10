import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { BalanceCellView, HcmRequestRecord } from "@/domain/types";

import { DecisionPanel } from "./DecisionPanel";

const REQUEST: HcmRequestRecord = {
  id: "req-0001",
  employeeId: "emp-alice",
  locationId: "loc-mx",
  days: 3,
  status: "pending",
  filedAt: "2026-06-10T11:00:00Z",
};

function view(days: number): BalanceCellView {
  return {
    confirmed: {
      employeeId: "emp-alice",
      locationId: "loc-mx",
      days,
      version: 4,
      updatedAt: "2026-06-10T12:00:00Z",
    },
    pending: [],
    projected: days,
    staleness: "fresh",
  };
}

const noop = (): void => undefined;

describe("DecisionPanel", () => {
  it("should show the balance context next to the decision (TRD §7)", () => {
    render(
      <DecisionPanel
        request={REQUEST}
        cellView={view(9)}
        isCellLoading={false}
        isDeciding={false}
        conflict={false}
        onApprove={noop}
        onDeny={noop}
      />,
    );

    expect(screen.getByText(/9/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /deny/i })).toBeEnabled();
  });

  it("should keep decisions disabled until the fresh balance read lands", () => {
    render(
      <DecisionPanel
        request={REQUEST}
        cellView={{ ...view(0), confirmed: undefined }}
        isCellLoading
        isDeciding={false}
        conflict={false}
        onApprove={noop}
        onDeny={noop}
      />,
    );

    expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /deny/i })).toBeDisabled();
  });

  it("should block the decision and explain when the balance moved (conflict)", () => {
    render(
      <DecisionPanel
        request={REQUEST}
        cellView={view(10)}
        isCellLoading={false}
        isDeciding={false}
        conflict
        onApprove={noop}
        onDeny={noop}
      />,
    );

    expect(screen.getByText(/balance changed/i)).toBeInTheDocument();
  });

  it("should invoke the decision callbacks", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(
      <DecisionPanel
        request={REQUEST}
        cellView={view(9)}
        isCellLoading={false}
        isDeciding={false}
        conflict={false}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );

    await user.click(screen.getByRole("button", { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /deny/i }));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });
});
