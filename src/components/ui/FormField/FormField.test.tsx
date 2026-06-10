import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { FormField } from "./FormField";

describe("FormField", () => {
  it("should wire the label to its control via htmlFor", () => {
    render(
      <FormField label="Days" htmlFor="days-input">
        <input id="days-input" type="number" />
      </FormField>,
    );
    expect(screen.getByLabelText("Days")).toBeInTheDocument();
  });
});
