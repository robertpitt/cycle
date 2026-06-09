import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bug, CircleDashed, Layers2, ListTodo, SquareStack } from "lucide-react";
import { ViewTab } from "./index.ts";
const meta = {
  args: {
    active: true,
    label: "Active",
  },
  component: ViewTab,
  tags: ["autodocs"],
  title: "Molecules/View Tab",
} satisfies Meta<typeof ViewTab>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const TabSet: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ViewTab icon={<Layers2 aria-hidden className="size-4" />} label="Engineering" active />
      <ViewTab icon={<ListTodo aria-hidden className="size-4" />} label="All issues" />
      <ViewTab icon={<SquareStack aria-hidden className="size-4" />} label="Active" />
      <ViewTab icon={<CircleDashed aria-hidden className="size-4" />} label="Backlog" />
      <ViewTab icon={<Bug aria-hidden className="size-4" />} label="Recent Urgent Bugs" />
    </div>
  ),
};
