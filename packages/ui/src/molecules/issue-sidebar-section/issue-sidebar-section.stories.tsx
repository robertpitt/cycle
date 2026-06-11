import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus } from "lucide-react";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { IssueSidebarSection } from "./index.ts";

const meta = {
  component: IssueSidebarSection,
  title: "Molecules/Issue Sidebar Section",
} satisfies Meta<typeof IssueSidebarSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    title: "Labels",
  },
  render: () => (
    <div className="w-[360px] rounded-lg border border-border bg-background p-4">
      <IssueSidebarSection
        actions={
          <IconButton
            icon={<Plus aria-hidden className="size-4" />}
            label="Add label"
            size="sm"
            title="Add label"
          />
        }
        title="Labels"
      >
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-subtle px-3 py-1 text-sm font-medium">
          <span className="size-2 rounded-full bg-destructive" />
          Bug
        </div>
      </IssueSidebarSection>
    </div>
  ),
};

export const Collapsed: Story = {
  args: {
    title: "Properties",
  },
  render: () => (
    <div className="w-[360px] rounded-lg border border-border bg-background p-4">
      <IssueSidebarSection defaultOpen={false} title="Properties">
        <span>Status, priority, assignee, and due date.</span>
      </IssueSidebarSection>
    </div>
  ),
};
