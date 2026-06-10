import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Chip } from "./Chip";

describe("Chip", () => {
  it("should render the pill base with the consumer's color classes", () => {
    render(<Chip className="bg-emerald-100 text-emerald-800">Synced</Chip>);
    const chip = screen.getByText("Synced");
    expect(chip).toHaveClass("rounded-full", "font-medium", "bg-emerald-100");
  });

  it("should support the two pill type scales used in the app", () => {
    const { rerender } = render(<Chip size="xs">A</Chip>);
    expect(screen.getByText("A")).toHaveClass("text-xs");
    rerender(<Chip size="2xs">A</Chip>);
    expect(screen.getByText("A")).toHaveClass("text-[11px]");
  });
});
