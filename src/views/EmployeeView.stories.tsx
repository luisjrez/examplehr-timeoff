import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";

import { addBusinessDays, nextBusinessDay } from "@/domain/dateRange";

import { createHcmStore } from "@/mocks/hcmStore";
import { buildHcmHandlers } from "@/mocks/mswHandlers";

import { AppProviders } from "./AppProviders";
import { EmployeeView } from "./EmployeeView";

/**
 * Full employee flows against the MSW-backed mock HCM — the same brain the
 * real route handlers use (TRD §9). Each story is an interaction test: these
 * are the states the assignment demands, exercised end-to-end in the browser.
 */
const hcm = createHcmStore();

// The form forbids past dates, so ranges anchor to the real clock (frozen
// under Chromatic) via the same pure domain helpers the form uses.
const START = nextBusinessDay(new Date().toISOString().slice(0, 10));

async function pickRange(
  canvas: ReturnType<typeof within>,
  businessDays: number,
): Promise<void> {
  const end = addBusinessDays(START, businessDays - 1);
  await fireEvent.change(canvas.getByLabelText(/start date/i), {
    target: { value: START },
  });
  await fireEvent.change(canvas.getByLabelText(/end date/i), {
    target: { value: end },
  });
}

const meta = {
  title: "Flows/EmployeeView",
  component: EmployeeView,
  loaders: [
    (): Promise<Record<string, never>> => {
      hcm.reset();
      return Promise.resolve({});
    },
  ],
  decorators: [
    (Story): React.ReactElement => (
      <AppProviders>
        <Story />
      </AppProviders>
    ),
  ],
  parameters: {
    msw: { handlers: buildHcmHandlers(hcm) },
  },
} satisfies Meta<typeof EmployeeView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hydrated happy path: both location cells confirmed from the corpus. */
export const Hydrated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByText("Mexico City")).toBeInTheDocument();
    });
    await expect(canvas.getByText("12")).toBeInTheDocument();
    await expect(canvas.getByText("5")).toBeInTheDocument();
  },
};

/** Loading: the corpus never answers; the UI says so instead of guessing. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/hcm/corpus", async () => {
          await delay("infinite");
          return HttpResponse.json({ cells: [] });
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/loading balances from hcm/i),
    ).toBeInTheDocument();
    // The form skeletons too: without locations it is not actionable.
    await expect(
      canvas.getByRole("status", { name: /loading request form/i }),
    ).toBeInTheDocument();
  },
};

/** Empty: HCM knows no balances for this employee. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/hcm/corpus", () => HttpResponse.json({ cells: [] })),
        http.get("/api/hcm/requests", () =>
          HttpResponse.json({ requests: [] }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByText(/no balances found/i)).toBeInTheDocument();
    });
  },
};

/**
 * Optimistic-pending → confirmed: with a slow HCM the projection moves
 * immediately and discloses the split; verification then folds the hold
 * into the confirmed number.
 */
export const OptimisticPendingThenConfirmed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByText("12")).toBeInTheDocument();
    });

    await userEvent.selectOptions(
      canvas.getByLabelText(/hcm chaos mode/i),
      "latency:2000",
    );
    await pickRange(canvas, 2);
    await userEvent.click(
      canvas.getByRole("button", { name: /request time off/i }),
    );

    // While HCM is slow: optimistic projection with honest provenance.
    await waitFor(async () => {
      await expect(canvas.getByText("10")).toBeInTheDocument();
      await expect(
        canvas.getByText(/12 confirmed by hcm · −2 pending/i),
      ).toBeInTheDocument();
    });

    // After verification: same number, now confirmed — split gone.
    // (The wording shows both in the timeline and in the toast → getAllByText.)
    await waitFor(
      async () => {
        const matches = canvas.getAllByText(/awaiting manager approval/i);
        await expect(matches.length).toBeGreaterThanOrEqual(1);
        await expect(
          canvas.queryByText(/pending confirmation/i),
        ).not.toBeInTheDocument();
      },
      { timeout: 8000 },
    );
  },
};

/**
 * HCM-silently-wrong → optimistic-rolled-back: the 200 lied; verification
 * catches it, the projection rolls back, recovery is offered.
 */
export const SilentFailureRollsBack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByText("12")).toBeInTheDocument();
    });

    await userEvent.selectOptions(
      canvas.getByLabelText(/hcm chaos mode/i),
      "silent-failure",
    );
    await pickRange(canvas, 2);
    await userEvent.click(
      canvas.getByRole("button", { name: /request time off/i }),
    );

    await waitFor(
      async () => {
        await expect(
          canvas.getByText(/hcm did not apply this request/i),
        ).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
    // Rolled back: the projection shows HCM truth again.
    await expect(canvas.getByText("12")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /retry with fresh balance/i }),
    ).toBeInTheDocument();
  },
};

/** HCM-rejected: a clean insufficient-balance denial, no optimism left over. */
export const RejectedInsufficientBalance: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByText("12")).toBeInTheDocument();
    });

    await pickRange(canvas, 15); // 15 business days — more than the 12 available
    await userEvent.click(
      canvas.getByRole("button", { name: /request time off/i }),
    );

    await waitFor(
      async () => {
        await expect(canvas.getByText("Denied")).toBeInTheDocument();
        // Reason appears in the timeline detail AND the rejection toast.
        const reasons = canvas.getAllByText(/not enough days available/i);
        await expect(reasons.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 8000 },
    );
    await expect(canvas.getByText("12")).toBeInTheDocument();
  },
};

/**
 * Balance-refreshed-mid-session: the anniversary bonus lands while the app
 * is open; the UI reconciles and narrates the change instead of surprising.
 */
export const BalanceRefreshedMidSession: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByText("12")).toBeInTheDocument();
    });

    await userEvent.click(
      canvas.getByRole("button", { name: /anniversary bonus/i }),
    );

    await waitFor(
      async () => {
        await expect(canvas.getByText("13")).toBeInTheDocument();
        // Both of Alice's cells got the bonus → one toast per cell.
        const toasts = canvas.getAllByText(/balance updated by hcm/i);
        await expect(toasts.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 8000 },
    );
  },
};

/**
 * Invalid range: the form explains the problem and refuses to submit —
 * the user can never file a range HCM would have to reject on shape.
 */
export const InvalidRangeBlocked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByText("12")).toBeInTheDocument();
    });

    // End before start.
    await fireEvent.change(canvas.getByLabelText(/start date/i), {
      target: { value: addBusinessDays(START, 3) },
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
  },
};
