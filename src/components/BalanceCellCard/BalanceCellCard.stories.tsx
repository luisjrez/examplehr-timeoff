import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { BalanceCellView, TimeOffRequest } from "@/domain/types";

import { BalanceCellCard } from "./BalanceCellCard";

/**
 * The balance cell in every provenance state (TRD §4): the big number is the
 * projection; the confirmed/pending split keeps the optimism honest.
 */
const meta = {
  title: "Components/BalanceCellCard",
  component: BalanceCellCard,
} satisfies Meta<typeof BalanceCellCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const CONFIRMED = {
  employeeId: "emp-alice",
  locationId: "loc-mx",
  days: 10,
  version: 3,
  updatedAt: "2026-06-10T11:59:30.000Z",
} as const;

function holdingRequest(days: number): TimeOffRequest {
  return {
    id: "req-hold",
    employeeId: "emp-alice",
    locationId: "loc-mx",
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    days,
    phase: { status: "verifying" },
    createdAt: "2026-06-10T11:59:30.000Z",
  };
}

function view(overrides: Partial<BalanceCellView>): BalanceCellView {
  return {
    confirmed: CONFIRMED,
    pending: [],
    projected: CONFIRMED.days,
    staleness: "fresh",
    ...overrides,
  };
}

/** Confirmed and fresh — the boring, trustworthy default. */
export const Fresh: Story = {
  args: {
    locationName: "Mexico City",
    view: view({}),
    isLoading: false,
  },
};

/** No confirmed value yet: skeleton, never a fake zero. */
export const Loading: Story = {
  args: {
    locationName: "Mexico City",
    view: view({ confirmed: undefined, projected: 0 }),
    isLoading: true,
  },
};

/** Optimistic-pending: a hold is in flight; the split is disclosed. */
export const OptimisticPending: Story = {
  args: {
    locationName: "Mexico City",
    view: view({ projected: 8, pending: [holdingRequest(2)] }),
    isLoading: false,
  },
};

/** Confirmed data older than 30s — flagged, not hidden. */
export const Aging: Story = {
  args: {
    locationName: "Mexico City",
    view: view({ staleness: "aging" }),
    isLoading: false,
  },
};

/** HCM has been silent for over 2 minutes: the number wears a warning. */
export const Stale: Story = {
  args: {
    locationName: "Mexico City",
    view: view({ staleness: "stale" }),
    isLoading: false,
  },
};

/** Cell that exists in the ledger but was never confirmed by HCM. */
export const NeverConfirmed: Story = {
  args: {
    locationName: "Mexico City",
    view: view({
      confirmed: undefined,
      projected: -2,
      pending: [holdingRequest(2)],
      staleness: "stale",
    }),
    isLoading: false,
  },
};
