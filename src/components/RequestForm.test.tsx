import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RequestForm } from "./RequestForm";

const LOCATIONS = [
  { id: "loc-mx", name: "Mexico City" },
  { id: "loc-us", name: "Austin, TX" },
] as const;

describe("RequestForm", () => {
  it("should submit the selected location and day count", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RequestForm
        locations={LOCATIONS}
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText(/location/i),
      "loc-us",
    );
    await user.clear(screen.getByLabelText(/days/i));
    await user.type(screen.getByLabelText(/days/i), "3");
    await user.click(screen.getByRole("button", { name: /request time off/i }));

    expect(onSubmit).toHaveBeenCalledWith({ locationId: "loc-us", days: 3 });
  });

  it("should not submit zero or negative day counts", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RequestForm
        locations={LOCATIONS}
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    );

    await user.clear(screen.getByLabelText(/days/i));
    await user.type(screen.getByLabelText(/days/i), "0");
    await user.click(screen.getByRole("button", { name: /request time off/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should disable submission while a request is in flight", () => {
    render(
      <RequestForm locations={LOCATIONS} isSubmitting onSubmit={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: /submitting/i }),
    ).toBeDisabled();
  });
});
