import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommandField } from "./index.ts";
const meta = {
  args: {
    label: "Search",
    shortcut: "K",
  },
  component: CommandField,
  tags: ["autodocs"],
  title: "Molecules/Command Field",
} satisfies Meta<typeof CommandField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const Variants: Story = {
  render: () => (
    <div className="grid max-w-sm gap-3">
      <CommandField label="Search" />
      <CommandField label="Jump to issue" shortcut="J" />
      <CommandField label="Filter workspace" shortcut="" />
    </div>
  ),
};
