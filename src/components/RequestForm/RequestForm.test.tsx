import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { addBusinessDays, nextBusinessDay } from "@/domain/dateRange";

import { RequestForm } from "./RequestForm";

const LOCATIONS = [
  { id: "loc-mx", name: "Mexico City" },
  { id: "loc-us", name: "Austin, TX" },
] as const;

// Anchored to the real clock: the form forbids past dates, so fixtures are
// generated relative to today via the same pure domain helpers.
const TODAY = new Date().toISOString().slice(0, 10);
const START = nextBusinessDay(TODAY);
const END_3_DAYS = addBusinessDays(START, 2);

// Native date inputs don't accept simulated keyboard input the way text
// fields do — change events are the standard way to drive them in tests.
function setDate(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("RequestForm", () => {
  it("should submit the range with its derived business-day count", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RequestForm
        locations={LOCATIONS}
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/location/i), "loc-us");
    setDate(/start date/i, START);
    setDate(/end date/i, END_3_DAYS);
    await user.click(screen.getByRole("button", { name: /request time off/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      locationId: "loc-us",
      startDate: START,
      endDate: END_3_DAYS,
      days: 3,
    });
  });

  it("should narrate the derived hold before submitting", () => {
    render(
      <RequestForm
        locations={LOCATIONS}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );

    setDate(/end date/i, END_3_DAYS);

    expect(screen.getByText(/3 business days/i)).toBeInTheDocument();
  });

  it("should block an inverted range and say why", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RequestForm
        locations={LOCATIONS}
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    );

    setDate(/start date/i, END_3_DAYS);
    setDate(/end date/i, START);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /end date is before the start date/i,
    );
    const submit = screen.getByRole("button", { name: /request time off/i });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should default to the next business day (never a past or weekend start)", () => {
    render(
      <RequestForm
        locations={LOCATIONS}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/start date/i)).toHaveValue(START);
    expect(screen.getByLabelText(/end date/i)).toHaveValue(START);
    expect(screen.getByText(/^1 business day$/)).toBeInTheDocument();
  });

  it("should disable submission while a request is in flight", () => {
    render(
      <RequestForm locations={LOCATIONS} isSubmitting onSubmit={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();
  });
});
