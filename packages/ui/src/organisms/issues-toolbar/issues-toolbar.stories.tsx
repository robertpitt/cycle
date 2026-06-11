import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bug, CircleDashed, ListTodo, Settings, SquareStack } from "lucide-react";
import { IssuesToolbar } from "./index.ts";
const meta = {
  args: {
    tabs: [
      {
        active: true,
        icon: Settings,
        label: "Engineering",
      },
      {
        icon: ListTodo,
        label: "All issues",
      },
      {
        icon: SquareStack,
        label: "Active",
      },
      {
        icon: CircleDashed,
        label: "Backlog",
      },
      {
        icon: Bug,
        label: "Recent Urgent Bugs",
      },
    ],
    moreCount: 5,
    title: "Engineering > Active issues",
  },
  component: IssuesToolbar,
  tags: ["autodocs"],
  title: "Organisms/Issues Toolbar",
} satisfies Meta<typeof IssuesToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: (args) => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <IssuesToolbar {...args} />
    </div>
  ),
};

export const FilterActive: Story = {
  args: {
    displayActive: true,
    displayLabel: "Compact",
    filterActive: true,
    filterControls: <span className="text-sm text-muted-foreground">8 shown</span>,
    filterLabel: "High signal",
    layersActive: true,
  },
  render: (args) => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <IssuesToolbar {...args} />
    </div>
  ),
};

export const MinimalActions: Story = {
  args: {
    moreCount: 0,
    showSecondaryActions: false,
  },
  render: (args) => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <IssuesToolbar {...args} />
    </div>
  ),
};
