import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import type { BalanceCellView, HcmRequestRecord } from "@/domain/types";

import { DecisionPanel } from "./DecisionPanel";

/** Manager decision integrity states (TRD §7). */
const meta = {
  title: "Components/DecisionPanel",
  component: DecisionPanel,
  args: {
    onApprove: fn(),
    onDeny: fn(),
  },
} satisfies Meta<typeof DecisionPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const REQUEST: HcmRequestRecord = {
  id: "req-0001",
  employeeId: "emp-alice",
  locationId: "loc-mx",
  days: 3,
  status: "pending",
  filedAt: "2026-06-10T11:59:30.000Z",
};

function cellView(days: number): BalanceCellView {
  return {
    confirmed: {
      employeeId: "emp-alice",
      locationId: "loc-mx",
      days,
      version: 4,
      updatedAt: "2026-06-10T11:59:30.000Z",
    },
    pending: [],
    projected: days,
    staleness: "fresh",
  };
}

/** Fresh read landed; the manager may decide against these exact numbers. */
export const ReadyToDecide: Story = {
  args: {
    request: REQUEST,
    cellView: cellView(9),
    isCellLoading: false,
    isDeciding: false,
    conflict: false,
  },
};

/** Buttons stay locked until the decision-time balance read lands. */
export const WaitingForFreshBalance: Story = {
  args: {
    request: REQUEST,
    cellView: { ...cellView(0), confirmed: undefined },
    isCellLoading: true,
    isDeciding: false,
    conflict: false,
  },
};

/** Decision in flight. */
export const Deciding: Story = {
  args: {
    request: REQUEST,
    cellView: cellView(9),
    isCellLoading: false,
    isDeciding: true,
    conflict: false,
  },
};

/**
 * Balance-refreshed-mid-decision: HCM moved (409); the panel re-armed with
 * fresh truth and explains why the first click did not approve.
 */
export const ConflictBalanceMoved: Story = {
  args: {
    request: REQUEST,
    cellView: cellView(10),
    isCellLoading: false,
    isDeciding: false,
    conflict: true,
  },
};
