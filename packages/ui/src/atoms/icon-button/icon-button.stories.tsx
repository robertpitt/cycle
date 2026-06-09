import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bell, MoreHorizontal, Plus, Search } from "lucide-react";
import { IconButton } from "./index.ts";
const meta = {
  args: {
    icon: <Search aria-hidden className="size-4" />,
    label: "Search",
    size: "md",
    variant: "ghost",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md"],
    },
    variant: {
      control: "select",
      options: ["primary", "secondary", "outline", "ghost", "destructive"],
    },
  },
  component: IconButton,
  tags: ["autodocs"],
  title: "Atoms/Icon Button",
} satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const ToolbarSet: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <IconButton icon={<Search aria-hidden className="size-4" />} label="Search" />
      <IconButton icon={<Bell aria-hidden className="size-4" />} label="Notifications" />
      <IconButton icon={<MoreHorizontal aria-hidden className="size-4" />} label="More" />
      <IconButton icon={<Plus aria-hidden className="size-4" />} label="Create" variant="outline" />
    </div>
  ),
};
