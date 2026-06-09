import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./index.ts";
const meta = {
  args: {
    defaultChecked: true,
  },
  component: Switch,
  tags: ["autodocs"],
  title: "Atoms/Switch",
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {
  args: {
    defaultChecked: true,
  },
};
export const States: Story = {
  render: () => (
    <div className="grid gap-3">
      <label className="flex items-center justify-between gap-6 text-sm">
        Enabled
        <Switch defaultChecked />
      </label>
      <label className="flex items-center justify-between gap-6 text-sm">
        Disabled
        <Switch />
      </label>
      <label className="flex items-center justify-between gap-6 text-sm text-muted-foreground">
        Unavailable
        <Switch disabled />
      </label>
    </div>
  ),
};
