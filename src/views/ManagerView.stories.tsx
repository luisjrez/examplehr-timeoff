import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { createHcmStore } from "@/mocks/hcmStore";
import { buildHcmHandlers } from "@/mocks/mswHandlers";

import { AppProviders } from "./AppProviders";
import { ManagerView } from "./ManagerView";

/**
 * Manager decision-integrity flows (TRD §7) against the MSW-backed HCM.
 * The version-conflict story is the proof of the CAS gate: the bonus fires
 * between the panel read and the approval click.
 */
const hcm = createHcmStore();

const END_BY_DAYS: Readonly<Record<number, string>> = {
  2: "2026-06-16",
  3: "2026-06-17",
};

function seedPendingRequest(days: number): void {
  const version = hcm.getCell("emp-alice", "loc-mx")?.version ?? -1;
  const filed = hcm.fileRequest({
    employeeId: "emp-alice",
    locationId: "loc-mx",
    startDate: "2026-06-15",
    endDate: END_BY_DAYS[days] ?? "2026-06-16",
    expectedVersion: version,
  });
  if (!filed.ok) {
    throw new Error("story seed failed");
  }
}

const meta = {
  title: "Flows/ManagerView",
  component: ManagerView,
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
} satisfies Meta<typeof ManagerView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Queue still loading: layout-true skeletons, no content jump. */
export const LoadingQueue: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/hcm/requests", async () => {
          await delay("infinite");
          return HttpResponse.json({ requests: [] });
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/loading pending requests/i),
    ).toBeInTheDocument();
  },
};

/** Nothing to review. */
export const EmptyQueue: Story = {
  loaders: [
    (): Promise<Record<string, never>> => {
      hcm.reset();
      return Promise.resolve({});
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(
        canvas.getByText(/no requests waiting for review/i),
      ).toBeInTheDocument();
    });
  },
};

/** A pending request with its decision-time balance context visible. */
export const PendingWithBalanceContext: Story = {
  loaders: [
    (): Promise<Record<string, never>> => {
      hcm.reset();
      seedPendingRequest(3);
      return Promise.resolve({});
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      // "3 day(s)" appears in the header AND in the outcome-preview line.
      const mentions = canvas.getAllByText(/3 day\(s\)/i);
      await expect(mentions.length).toBeGreaterThanOrEqual(1);
      // Balance right now: 9 (12 seeded − 3 held at filing).
      await expect(canvas.getByText("9")).toBeInTheDocument();
      // Hold semantics spelled out at decision time.
      await expect(
        canvas.getByText(/deny refunds it to 12/i),
      ).toBeInTheDocument();
    });
    await expect(
      canvas.getByRole("button", { name: /approve/i }),
    ).toBeEnabled();
  },
};

/** Approve happy path: the queue empties. */
export const ApproveHappyPath: Story = {
  loaders: [
    (): Promise<Record<string, never>> => {
      hcm.reset();
      seedPendingRequest(2);
      return Promise.resolve({});
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(
        canvas.getByRole("button", { name: /approve/i }),
      ).toBeEnabled();
    });

    await userEvent.click(canvas.getByRole("button", { name: /approve/i }));

    await waitFor(
      async () => {
        await expect(
          canvas.getByText(/no requests waiting for review/i),
        ).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
  },
};

/**
 * Decision conflict: the balance moves AFTER the panel read its fresh value;
 * the approval is structurally blocked (409) and the panel re-arms with truth.
 */
export const ConflictBalanceMovedUnderneath: Story = {
  loaders: [
    (): Promise<Record<string, never>> => {
      hcm.reset();
      seedPendingRequest(2);
      return Promise.resolve({});
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(
        canvas.getByRole("button", { name: /approve/i }),
      ).toBeEnabled();
    });

    // The world changes between the manager's read and their click.
    hcm.triggerAnniversary("emp-alice");

    await userEvent.click(canvas.getByRole("button", { name: /approve/i }));

    await waitFor(
      async () => {
        await expect(
          canvas.getByText(/the balance changed since you opened/i),
        ).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
    // Request still pending — nothing was approved blind.
    await expect(
      canvas.getByRole("button", { name: /approve/i }),
    ).toBeInTheDocument();
  },
};
