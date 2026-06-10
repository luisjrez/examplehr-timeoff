import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "./Button";

describe("Button", () => {
  it("should render each variant with its visual tokens", () => {
    const { rerender } = render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveClass(
      "bg-blue-600",
    );
    rerender(<Button variant="success">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-emerald-600");
    rerender(<Button variant="danger">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-red-600");
    rerender(<Button variant="ghost">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("border-gray-300");
  });

  it("should default to type=button so it never submits forms by accident", () => {
    render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("should forward native props (type=submit, disabled, onClick)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="primary" type="submit" onClick={onClick}>
        Send
      </Button>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should not fire when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Send
      </Button>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
