import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select } from "./index.ts";
const meta = {
  component: Select,
  tags: ["autodocs"],
  title: "Atoms/Select",
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {
  render: () => (
    <Select className="max-w-sm" defaultValue="product">
      <option value="product">Product</option>
      <option value="design">Design</option>
      <option value="engineering">Engineering</option>
    </Select>
  ),
};
export const States: Story = {
  render: () => (
    <div className="grid max-w-sm gap-3">
      <Select defaultValue="active">
        <option value="active">Active</option>
        <option value="backlog">Backlog</option>
      </Select>
      <Select disabled>
        <option>Disabled</option>
      </Select>
    </div>
  ),
};
