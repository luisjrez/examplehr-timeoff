import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Chip } from "./Chip";

/** Design-system reference: the pill shapes used by badges and status chips. */
const meta = {
  title: "UI/Chip",
  component: Chip,
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AppTones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <Chip className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
        Synced
      </Chip>
      <Chip className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
        Sync delayed
      </Chip>
      <Chip className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
        Out of sync
      </Chip>
      <Chip className="text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/40">
        Verifying with HCM…
      </Chip>
      <Chip
        size="2xs"
        className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
      >
        ● Live
      </Chip>
    </div>
  ),
};
