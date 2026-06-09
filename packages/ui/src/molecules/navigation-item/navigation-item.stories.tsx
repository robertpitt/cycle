import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Inbox, Layers, ListChecks } from "lucide-react";
import { NavigationItem } from "./index.ts";
const meta = {
  args: {
    active: false,
    label: "Issues",
  },
  component: NavigationItem,
  tags: ["autodocs"],
  title: "Molecules/Navigation Item",
} satisfies Meta<typeof NavigationItem>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const SidebarSet: Story = {
  render: () => (
    <div className="grid w-64 gap-1 rounded-lg border border-border bg-sidebar p-2">
      <NavigationItem count="1" icon={<Inbox aria-hidden className="size-4" />} label="Inbox" />
      <NavigationItem icon={<ListChecks aria-hidden className="size-4" />} label="Issues" active />
      <NavigationItem icon={<Layers aria-hidden className="size-4" />} label="Views" />
      <NavigationItem depth={1} icon={<Box aria-hidden className="size-4" />} label="Projects" />
    </div>
  ),
};
