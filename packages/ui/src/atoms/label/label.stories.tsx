import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "../input/index.ts";
import { Label } from "./index.ts";
const meta = {
  args: {
    children: "Workspace name",
  },
  component: Label,
  tags: ["autodocs"],
  title: "Atoms/Label",
} satisfies Meta<typeof Label>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const WithControl: Story = {
  render: () => (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="workspace-name">Workspace name</Label>
      <Input id="workspace-name" placeholder="Horizon" />
    </div>
  ),
};
