import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "../label/index.ts";
import { Checkbox } from "./index.ts";
const meta = {
  args: {
    defaultChecked: true,
  },
  component: Checkbox,
  tags: ["autodocs"],
  title: "Atoms/Checkbox",
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const States: Story = {
  render: () => (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox defaultChecked />
        Checked
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox />
        Unchecked
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox indeterminate />
        Partially selected
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox disabled />
        Disabled
      </label>
    </div>
  ),
};
export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="checkbox-summary" />
      <Label htmlFor="checkbox-summary">Send summary</Label>
    </div>
  ),
};
