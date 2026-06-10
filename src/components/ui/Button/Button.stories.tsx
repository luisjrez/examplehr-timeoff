import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./Button";

/** Design-system reference: every variant × size in use across the app. */
const meta = {
  title: "UI/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: { variant: "primary", children: "Button" },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <Button {...args} variant="primary">
        Request time off
      </Button>
      <Button {...args} variant="success">
        Approve
      </Button>
      <Button {...args} variant="danger">
        Deny
      </Button>
      <Button {...args} variant="ghost">
        Discard
      </Button>
      <Button {...args} variant="primary" disabled>
        Disabled
      </Button>
    </div>
  ),
};

export const Sizes: Story = {
  args: { variant: "primary", children: "Button" },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3 p-4 text-xs">
      <Button {...args} size="md">
        md
      </Button>
      <Button {...args} size="sm">
        sm
      </Button>
      <Button {...args} size="xs">
        xs
      </Button>
      <Button {...args} size="2xs">
        2xs
      </Button>
    </div>
  ),
};
