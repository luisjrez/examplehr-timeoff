import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Card } from "./Card";

describe("Card", () => {
  it("should render the bordered container with rounding and padding scales", () => {
    render(
      <Card rounded="xl" padding="4" data-testid="card">
        content
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card).toHaveClass("rounded-xl", "border", "p-4");
    expect(card.tagName).toBe("DIV");
  });

  it("should render as a list item for timeline rows", () => {
    render(
      <Card as="li" rounded="lg" padding="3" data-testid="card">
        row
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.tagName).toBe("LI");
    expect(card).toHaveClass("rounded-lg", "p-3");
  });

  it("should merge consumer layout classes", () => {
    render(
      <Card
        rounded="lg"
        padding="4"
        className="flex flex-col"
        data-testid="card"
      >
        x
      </Card>,
    );
    expect(screen.getByTestId("card")).toHaveClass(
      "flex",
      "flex-col",
      "border",
    );
  });
});
