import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { RequestForm } from "./RequestForm";

const meta = {
  title: "Components/RequestForm",
  component: RequestForm,
  args: {
    locations: [
      { id: "loc-mx", name: "Mexico City" },
      { id: "loc-us", name: "Austin, TX" },
    ],
    onSubmit: fn(),
  },
} satisfies Meta<typeof RequestForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { isSubmitting: false },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText(/location/i), "loc-us");
    await userEvent.clear(canvas.getByLabelText(/days/i));
    await userEvent.type(canvas.getByLabelText(/days/i), "3");
    await userEvent.click(
      canvas.getByRole("button", { name: /request time off/i }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({
      locationId: "loc-us",
      days: 3,
    });
  },
};

export const Submitting: Story = {
  args: { isSubmitting: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: /submitting/i }),
    ).toBeDisabled();
  },
};
