import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { RequestPhase } from "@/domain/types";

import { RequestTimeline } from "./RequestTimeline";

/**
 * One story per FSM state (TRD §5): the stories are derived from the machine,
 * not invented — if a state exists, it has a visual contract here.
 */
const meta = {
  title: "Components/RequestTimeline",
  component: RequestTimeline,
  args: {
    locationName: "Mexico City",
    onRetry: fn(),
    onDiscard: fn(),
  },
  decorators: [
    (Story): React.ReactElement => (
      <ul className="w-96">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof RequestTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

function request(phase: RequestPhase): {
  id: string;
  employeeId: string;
  locationId: string;
  startDate: string;
  endDate: string;
  days: number;
  phase: RequestPhase;
  createdAt: string;
} {
  return {
    id: "client-1",
    employeeId: "emp-alice",
    locationId: "loc-mx",
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    days: 2,
    phase,
    createdAt: "2026-06-10T11:59:30.000Z",
  };
}

export const Submitting: Story = {
  args: { request: request({ status: "submitting" }) },
};

/** The 2xx arrived but nothing is trusted yet — "verifying", never "done". */
export const Verifying: Story = {
  args: { request: request({ status: "verifying" }) },
};

export const AwaitingApproval: Story = {
  args: { request: request({ status: "pending_approval" }) },
};

export const Approved: Story = {
  args: { request: request({ status: "approved" }) },
};

/** HCM-rejected: a clean denial with its reason. */
export const DeniedInsufficientBalance: Story = {
  args: {
    request: request({ status: "denied", reason: "insufficient_balance" }),
  },
};

export const DeniedByManager: Story = {
  args: { request: request({ status: "denied", reason: "hcm_error" }) },
};

/**
 * HCM-silently-wrong / optimistic-rolled-back: the success that lied.
 * Recovery affordances must be present and wired.
 */
export const ContradictedSilentlyWrong: Story = {
  args: {
    request: request({ status: "contradicted", reason: "verify_mismatch" }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/hcm did not apply this request/i),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: /retry with fresh balance/i }),
    );
    await expect(args.onRetry).toHaveBeenCalledWith("client-1");
    await userEvent.click(canvas.getByRole("button", { name: /discard/i }));
    await expect(args.onDiscard).toHaveBeenCalledWith("client-1");
  },
};

export const ContradictedVersionConflict: Story = {
  args: {
    request: request({ status: "contradicted", reason: "version_conflict" }),
  },
};

export const ContradictedHcmSilent: Story = {
  args: {
    request: request({ status: "contradicted", reason: "hcm_silent" }),
  },
};

export const Discarded: Story = {
  args: { request: request({ status: "discarded" }) },
};
