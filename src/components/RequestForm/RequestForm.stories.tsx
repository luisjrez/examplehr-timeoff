import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";

import { addBusinessDays, nextBusinessDay } from "@/domain/dateRange";

import { RequestForm } from "./RequestForm";

const START = nextBusinessDay(new Date().toISOString().slice(0, 10));
const END_3_DAYS = addBusinessDays(START, 2);

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
    await fireEvent.change(canvas.getByLabelText(/start date/i), {
      target: { value: START },
    });
    await fireEvent.change(canvas.getByLabelText(/end date/i), {
      target: { value: END_3_DAYS },
    });
    // The derived hold is narrated before submitting.
    await expect(canvas.getByText(/3 business days/i)).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: /request time off/i }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({
      locationId: "loc-us",
      startDate: START,
      endDate: END_3_DAYS,
      days: 3,
    });
  },
};

/** Invalid range: explained inline, submit disabled. */
export const InvalidRange: Story = {
  args: { isSubmitting: false },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await fireEvent.change(canvas.getByLabelText(/start date/i), {
      target: { value: END_3_DAYS },
    });
    await fireEvent.change(canvas.getByLabelText(/end date/i), {
      target: { value: START },
    });
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      /end date is before the start date/i,
    );
    await expect(
      canvas.getByRole("button", { name: /request time off/i }),
    ).toBeDisabled();
    await expect(args.onSubmit).not.toHaveBeenCalled();
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
