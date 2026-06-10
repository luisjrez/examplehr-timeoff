import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { BalanceCellView, TimeOffRequest } from "@/domain/types";

import { BalanceCellCard } from "./BalanceCellCard";

function makeView(overrides: Partial<BalanceCellView>): BalanceCellView {
  return {
    confirmed: {
      employeeId: "emp-alice",
      locationId: "loc-mx",
      days: 10,
      version: 3,
      updatedAt: "2026-06-10T12:00:00Z",
    },
    pending: [],
    projected: 10,
    staleness: "fresh",
    ...overrides,
  };
}

function pendingRequest(days: number): TimeOffRequest {
  return {
    id: "req-1",
    employeeId: "emp-alice",
    locationId: "loc-mx",
    days,
    phase: { status: "verifying" },
    createdAt: "2026-06-10T12:00:00Z",
  };
}

describe("BalanceCellCard", () => {
  it("should show the projected balance as the main figure", () => {
    render(
      <BalanceCellCard
        locationName="Mexico City"
        view={makeView({})}
        isLoading={false}
      />,
    );

    expect(screen.getByText("Mexico City")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("should disclose the confirmed/pending split when a hold is in flight (honest optimism)", () => {
    render(
      <BalanceCellCard
        locationName="Mexico City"
        view={makeView({
          projected: 8,
          pending: [pendingRequest(2)],
        })}
        isLoading={false}
      />,
    );

    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText(/10 confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/2 pending confirmation/i)).toBeInTheDocument();
  });

  it("should flag stale data instead of presenting it as current", () => {
    render(
      <BalanceCellCard
        locationName="Mexico City"
        view={makeView({ staleness: "stale" })}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/out of sync/i)).toBeInTheDocument();
  });

  it("should render a loading skeleton when no confirmed value exists yet", () => {
    render(
      <BalanceCellCard
        locationName="Mexico City"
        view={makeView({ confirmed: undefined, projected: 0 })}
        isLoading
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
