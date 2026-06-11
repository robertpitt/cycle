import type { Meta, StoryObj } from "@storybook/react-vite";
import { Inbox, ListTodo, Plus } from "lucide-react";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { NavigationItem } from "../navigation-item/index.ts";
import { ShellSidebarSection } from "./index.ts";

const meta = {
  args: {
    title: "Workspace",
  },
  component: ShellSidebarSection,
  tags: ["autodocs"],
  title: "Molecules/Shell Sidebar Section",
} satisfies Meta<typeof ShellSidebarSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-[260px] rounded-lg border border-border bg-sidebar p-3 text-sidebar-foreground">
      <ShellSidebarSection
        action={
          <IconButton
            icon={<Plus aria-hidden className="size-3.5" />}
            label="Add workspace item"
            size="sm"
          />
        }
        title="Workspace"
      >
        <div className="grid gap-1">
          <NavigationItem
            active
            count="4"
            icon={<Inbox aria-hidden className="size-4" />}
            label="Inbox"
          />
          <NavigationItem
            count="12"
            icon={<ListTodo aria-hidden className="size-4" />}
            label="Issues"
          />
        </div>
      </ShellSidebarSection>
    </div>
  ),
};

export const Collapsed: Story = {
  render: () => (
    <div className="w-[72px] rounded-lg border border-border bg-sidebar p-3 text-sidebar-foreground">
      <ShellSidebarSection collapsed title="Workspace">
        <div className="grid justify-items-center gap-1">
          <NavigationItem
            active
            className="size-9 justify-center rounded-lg px-0 [&>span:not(:first-child)]:sr-only"
            icon={<Inbox aria-hidden className="size-4" />}
            label={<span>Inbox</span>}
          />
          <NavigationItem
            className="size-9 justify-center rounded-lg px-0 [&>span:not(:first-child)]:sr-only"
            icon={<ListTodo aria-hidden className="size-4" />}
            label={<span>Issues</span>}
          />
        </div>
      </ShellSidebarSection>
    </div>
  ),
};
